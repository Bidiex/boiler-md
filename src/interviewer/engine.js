const { DOCUMENTS, TOTAL_DOCS } = require('./documents');
const {
  SYSTEM_PROMPT,
  COMPLETE_DOCUMENT_TOOL,
  UPDATE_PREVIOUS_DOCUMENT_TOOL,
  buildContextMessage,
} = require('./prompt');
const { generateDocument, regenerateDocument } = require('./generator');
const { createMessage, textOf } = require('../anthropic');
const { ConflictError, InterviewError } = require('../errors');
const store = require('../store');

const MAX_TOOL_ERRORS = 2;
const PROJECT_TYPES = COMPLETE_DOCUMENT_TOOL.input_schema.properties.project_type.enum;

// Cada documento tiene su propio historial de mensajes con la API. Al cerrar uno
// se redacta su .md, y el siguiente arranca limpio con solo los .md anteriores:
// así el contexto no crece sin límite a lo largo de los 9 documentos.
function createState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    status: 'in_progress', // in_progress | complete
    project: { name: null, type: null, typeDetail: null },
    currentDoc: 0,
    transcript: [], // lo que ve el usuario: { role, text, doc }
    docs: DOCUMENTS.map((_, index) => ({
      index,
      status: 'pending', // pending | active | complete
      messages: [],
      summary: null,
      markdown: null, // nunca se expone al frontend hasta la descarga final
    })),
  };
}

let state = store.loadSession() || createState();
let busy = false;

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

function pad(n) {
  return String(n).padStart(2, '0');
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

// --- Herramientas ---

function validateCompletion(docIndex, input) {
  if (typeof input?.summary !== 'string' || !input.summary.trim()) {
    return 'Falta "summary" con el resumen de decisiones del documento.';
  }
  if (docIndex === 0) {
    if (typeof input.project_name !== 'string' || !input.project_name.trim()) {
      return 'En el documento 01 es obligatorio "project_name".';
    }
    if (!PROJECT_TYPES.includes(input.project_type)) {
      return `En el documento 01 es obligatorio "project_type" con uno de: ${PROJECT_TYPES.join(', ')}.`;
    }
  }
  return null;
}

function validateUpdate(docIndex, input) {
  const target = Number(input?.doc_number);
  if (!Number.isInteger(target) || target < 1 || target > docIndex) {
    return `"doc_number" debe ser un documento ya cerrado (entre 1 y ${docIndex}).`;
  }
  if (typeof input.change !== 'string' || !input.change.trim()) {
    return 'Falta "change" con el cambio exacto acordado.';
  }
  return null;
}

async function applyUpdate(input) {
  const targetIndex = Number(input.doc_number) - 1;
  const target = state.docs[targetIndex];
  const change = input.change.trim();

  target.markdown = await regenerateDocument(state, targetIndex, change);
  target.summary = `${target.summary}\n\nActualización posterior: ${change}`;

  const doc = DOCUMENTS[targetIndex];
  state.transcript.push({
    role: 'system',
    text: `↺ Documento ${doc.number} · ${doc.title} actualizado`,
    doc: DOCUMENTS[state.currentDoc].number,
  });
  return `Documento ${pad(doc.number)} actualizado. Versión vigente:\n\n${target.markdown}`;
}

// Procesa las herramientas de una respuesta. Las actualizaciones se aplican al
// momento; el cierre del documento solo si nada más falló en la misma respuesta.
async function handleTools(docIndex, toolUses) {
  const results = [];
  let failed = false;
  let completion = null;

  const fail = (id, content) => {
    failed = true;
    results.push({ type: 'tool_result', tool_use_id: id, is_error: true, content });
  };

  for (const tu of toolUses) {
    if (tu.name === UPDATE_PREVIOUS_DOCUMENT_TOOL.name) {
      const error = validateUpdate(docIndex, tu.input);
      if (error) fail(tu.id, error);
      else results.push({ type: 'tool_result', tool_use_id: tu.id, content: await applyUpdate(tu.input) });
    } else if (tu.name === COMPLETE_DOCUMENT_TOOL.name) {
      const error = validateCompletion(docIndex, tu.input);
      if (error) fail(tu.id, error);
      else completion = tu;
    } else {
      fail(tu.id, `Herramienta desconocida: ${tu.name}`);
    }
  }

  if (completion) {
    if (failed) {
      results.push({
        type: 'tool_result',
        tool_use_id: completion.id,
        is_error: true,
        content: 'El documento no se cerró porque otra herramienta falló. Corrígela y vuelve a llamar a complete_document.',
      });
      completion = null;
    } else {
      results.push({ type: 'tool_result', tool_use_id: completion.id, content: 'Documento cerrado.' });
    }
  }

  return { results, failed, completion };
}

async function completeDoc(docIndex, input) {
  const docState = state.docs[docIndex];
  if (docIndex === 0) {
    state.project.name = input.project_name.trim();
    state.project.type = input.project_type;
    state.project.typeDetail = input.project_type_detail?.trim() || null;
  }
  docState.summary = input.summary.trim();
  docState.markdown = await generateDocument(state, docIndex);
  docState.status = 'complete';
}

// --- Turnos ---

// Ejecuta turnos del modelo sobre el documento actual hasta que devuelva la
// palabra al usuario. Si cierra el documento, lo redacta, abre el siguiente y sigue.
async function runTurn() {
  let toolErrors = 0;

  for (;;) {
    const docIndex = state.currentDoc;
    const docState = state.docs[docIndex];
    const response = await createMessage({
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: [COMPLETE_DOCUMENT_TOOL, UPDATE_PREVIOUS_DOCUMENT_TOOL],
      messages: docState.messages,
    });

    docState.messages.push({ role: 'assistant', content: response.content });

    const text = textOf(response);
    if (text) state.transcript.push({ role: 'assistant', text, doc: DOCUMENTS[docIndex].number });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (!toolUses.length) {
      if (response.stop_reason === 'max_tokens') {
        throw new InterviewError('La respuesta del modelo se cortó por longitud. Inténtalo de nuevo.');
      }
      return;
    }

    const { results, failed, completion } = await handleTools(docIndex, toolUses);
    docState.messages.push({ role: 'user', content: results });

    if (failed && ++toolErrors > MAX_TOOL_ERRORS) {
      throw new InterviewError('El modelo no pudo completar la acción correctamente. Inténtalo de nuevo.');
    }
    if (!completion) continue; // el modelo sigue con la entrevista tras ver los resultados

    await completeDoc(docIndex, completion.input);

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
    toolErrors = 0;
  }
}

// Evita turnos concurrentes y, si algo falla, deja el estado como estaba
// antes del turno para que el usuario pueda reintentar sin duplicados.
async function withTurn(fn) {
  if (busy) throw new ConflictError('Ya hay una respuesta en curso.');
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
  if (state.status === 'complete') throw new ConflictError('La entrevista ya terminó.');
  return withTurn(async () => {
    if (state.docs[state.currentDoc].status === 'pending') startDoc(state.currentDoc);
    const docState = state.docs[state.currentDoc];
    docState.messages.push({ role: 'user', content: text });
    state.transcript.push({ role: 'user', text, doc: DOCUMENTS[state.currentDoc].number });
    await runTurn();
  });
}

// Los documentos solo salen del servidor al completar los 9 (sección 4.3 del spec).
function getFinishedSpec() {
  if (state.status !== 'complete') {
    throw new ConflictError('La descarga se habilita al completar los 9 documentos.');
  }
  return { projectName: state.project.name, docs: state.docs };
}

function reset() {
  if (busy) throw new ConflictError('Espera a que termine la respuesta en curso.');
  store.deleteSession();
  state = createState();
  return publicState();
}

module.exports = { getState, start, sendMessage, reset, getFinishedSpec };
