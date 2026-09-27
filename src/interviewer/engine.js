const { default: Anthropic } = require('@anthropic-ai/sdk');
const { DOCUMENTS, TOTAL_DOCS } = require('./documents');
const { SYSTEM_PROMPT, COMPLETE_DOCUMENT_TOOL, buildContextMessage } = require('./prompt');
const store = require('../store');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_TOOL_RETRIES = 2;

// Se crea al primer uso para que el servidor arranque aunque falte la key.
let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new InterviewError('Falta ANTHROPIC_API_KEY en el .env del servidor.');
  }
  if (!client) client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
  return client;
}

// Cada documento tiene su propio historial de mensajes con la API. Al cerrar uno,
// el siguiente arranca limpio con solo el resumen de los anteriores: así el
// contexto no crece sin límite a lo largo de los 9 documentos.
function createState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    status: 'in_progress', // in_progress | complete
    project: { name: null, type: null, typeDetail: null },
    currentDoc: 0,
    transcript: [], // lo que ve el usuario: { role, text, doc }
    docs: DOCUMENTS.map((_, index) => ({ index, status: 'pending', messages: [], summary: null })),
  };
}

let state = store.loadSession() || createState();
let busy = false;

class BusyError extends Error {}
class InterviewError extends Error {}

function publicState() {
  const doc = DOCUMENTS[state.currentDoc];
  return {
    status: state.status,
    project: { name: state.project.name, type: state.project.type },
    totalDocs: TOTAL_DOCS,
    currentDoc: { number: doc.number, title: doc.title },
    completedDocs: state.docs.filter((d) => d.status === 'complete').length,
    transcript: state.transcript,
  };
}

async function callModel(messages) {
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    system: SYSTEM_PROMPT,
    tools: [COMPLETE_DOCUMENT_TOOL],
    messages,
  });
  return stream.finalMessage();
}

function validateCompletion(docIndex, input) {
  if (!input || typeof input.summary !== 'string' || !input.summary.trim()) {
    return 'Falta "summary" con el resumen de decisiones del documento.';
  }
  if (docIndex === 0) {
    if (!input.project_name || !input.project_name.trim()) {
      return 'En el documento 01 es obligatorio "project_name".';
    }
    if (!COMPLETE_DOCUMENT_TOOL.input_schema.properties.project_type.enum.includes(input.project_type)) {
      return 'En el documento 01 es obligatorio "project_type" con un valor válido.';
    }
  }
  return null;
}

function startDoc(docIndex) {
  const doc = DOCUMENTS[docIndex];
  state.currentDoc = docIndex;
  state.docs[docIndex].status = 'active';
  state.docs[docIndex].messages = [{ role: 'user', content: buildContextMessage(state, docIndex) }];
  state.transcript.push({
    role: 'system',
    text: `── Documento ${doc.number} de ${TOTAL_DOCS} · ${doc.title} ──`,
    doc: doc.number,
  });
}

function completeDoc(docIndex, input) {
  const docState = state.docs[docIndex];
  docState.status = 'complete';
  docState.summary = input.summary.trim();
  if (docIndex === 0) {
    state.project.name = input.project_name.trim();
    state.project.type = input.project_type;
    state.project.typeDetail = input.project_type_detail?.trim() || null;
  }
}

// Ejecuta turnos del modelo sobre el documento actual hasta que devuelva la
// palabra al usuario. Si cierra el documento, abre el siguiente y sigue.
async function runTurn() {
  let toolRetries = 0;

  for (;;) {
    const docIndex = state.currentDoc;
    const docState = state.docs[docIndex];
    const response = await callModel(docState.messages);

    if (response.stop_reason === 'refusal') {
      throw new InterviewError('El modelo declinó responder. Reformula tu respuesta e inténtalo de nuevo.');
    }

    docState.messages.push({ role: 'assistant', content: response.content });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (text) {
      state.transcript.push({ role: 'assistant', text, doc: DOCUMENTS[docIndex].number });
    }

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === COMPLETE_DOCUMENT_TOOL.name);
    if (!toolUse) {
      if (response.stop_reason === 'max_tokens') {
        throw new InterviewError('La respuesta del modelo se cortó por longitud. Inténtalo de nuevo.');
      }
      return;
    }

    const error = validateCompletion(docIndex, toolUse.input);
    if (error) {
      if (++toolRetries > MAX_TOOL_RETRIES) {
        throw new InterviewError('No se pudo cerrar el documento correctamente. Inténtalo de nuevo.');
      }
      docState.messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: error }],
      });
      continue;
    }

    docState.messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Documento cerrado.' }],
    });
    completeDoc(docIndex, toolUse.input);
    store.saveSession(state);

    if (docIndex + 1 >= TOTAL_DOCS) {
      state.status = 'complete';
      state.transcript.push({
        role: 'system',
        text: `── Entrevista completa · ${TOTAL_DOCS} de ${TOTAL_DOCS} documentos ──`,
        doc: TOTAL_DOCS,
      });
      return;
    }

    startDoc(docIndex + 1);
    toolRetries = 0;
  }
}

// Evita turnos concurrentes y, si algo falla, deja el estado como estaba
// antes del turno para que el usuario pueda reintentar sin duplicados.
async function withTurn(fn) {
  if (busy) throw new BusyError('Ya hay una respuesta en curso.');
  busy = true;
  const snapshot = JSON.stringify(state);
  try {
    await fn();
    store.saveSession(state);
    return publicState();
  } catch (err) {
    state = JSON.parse(snapshot);
    throw err;
  } finally {
    busy = false;
  }
}

function getState() {
  return publicState();
}

async function start() {
  if (state.transcript.length) return publicState();
  return withTurn(async () => {
    startDoc(0);
    await runTurn();
  });
}

async function sendMessage(text) {
  if (state.status === 'complete') throw new InterviewError('La entrevista ya terminó.');
  return withTurn(async () => {
    if (state.docs[state.currentDoc].status === 'pending') startDoc(state.currentDoc);
    const docState = state.docs[state.currentDoc];
    docState.messages.push({ role: 'user', content: text });
    state.transcript.push({ role: 'user', text, doc: DOCUMENTS[state.currentDoc].number });
    await runTurn();
  });
}

function reset() {
  if (busy) throw new BusyError('Espera a que termine la respuesta en curso.');
  store.deleteSession();
  state = createState();
  return publicState();
}

module.exports = { getState, start, sendMessage, reset, BusyError, InterviewError, MODEL };
