const { DOCUMENTS, TOTAL_DOCS } = require('./documents');
const { createMessage, textOf } = require('../anthropic');
const { InterviewError } = require('../errors');

const GENERATOR_SYSTEM = `Redactas documentos de especificación en markdown a partir de una entrevista entre un entrevistador y un desarrollador. Cada documento forma parte de una spec de ${TOTAL_DOCS} archivos que otro LLM (ej. Claude Code) leerá como fuente de verdad para construir el proyecto desde cero.

Reglas:
- Registra solo decisiones que el usuario tomó o confirmó en la entrevista. No inventes, no completes huecos con suposiciones, no agregues recomendaciones que el usuario no aceptó.
- Lo que quedó sin definir va marcado como "**Pendiente:**" con qué falta decidir. Lo que no aplica va como "**No aplica:**" con el motivo, si se dio.
- Sé concreto y denso: nombres, números, tecnologías y reglas exactas. Prosa mínima; prioriza listas y tablas cuando ordenan mejor la información.
- Escribe decisiones, no la conversación: nada de "el usuario dijo" ni "se preguntó".
- Si el documento referencia algo de un documento anterior, nómbralo igual que allí (misma entidad, mismo flujo, mismo término).
- Español. Los nombres técnicos (tecnologías, código, identificadores) se mantienen como están.
- Salida: SOLO el contenido markdown del documento, sin preámbulo, sin comentarios finales y sin envolverlo en bloques de código.

Formato por defecto (salvo que las instrucciones del documento indiquen otro):
# NN — Título del documento
Una línea con el nombre del proyecto y su tipo.
Luego una sección "## N. <tema>" por cada pregunta base, en el mismo orden, con las decisiones correspondientes y las sub-preguntas adaptadas que hayan surgido.`;

function docLabel(doc) {
  return `${String(doc.number).padStart(2, '0')} — ${doc.title}`;
}

function projectLine(state) {
  const { name, type, typeDetail } = state.project;
  if (!type) return null;
  return `Proyecto: ${name} · Tipo: ${typeDetail ? `${type} (${typeDetail})` : type}`;
}

// Reconstruye la entrevista del documento como texto plano, sin el mensaje de
// contexto interno ni los bloques de herramientas.
function interviewTranscript(docState) {
  const lines = [];
  for (const msg of docState.messages.slice(1)) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      lines.push(`Usuario: ${msg.content}`);
    } else if (msg.role === 'assistant') {
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (text) lines.push(`Entrevistador: ${text}`);
    }
  }
  return lines.join('\n\n');
}

function previousDocsBlock(state, beforeIndex) {
  const docs = state.docs.filter((d) => d.index < beforeIndex && d.markdown);
  if (!docs.length) return null;
  return `<documentos_previos>\n${docs.map((d) => d.markdown).join('\n\n---\n\n')}\n</documentos_previos>`;
}

function stripFences(markdown) {
  return markdown.replace(/^```(?:markdown|md)?\s*\n/, '').replace(/\n```\s*$/, '').trim();
}

async function write(userContent) {
  const message = await createMessage({
    max_tokens: 32000,
    system: GENERATOR_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  });
  if (message.stop_reason === 'max_tokens') {
    throw new InterviewError('La redacción del documento se cortó por longitud. Inténtalo de nuevo.');
  }
  const markdown = stripFences(textOf(message));
  if (!markdown) throw new InterviewError('El documento se generó vacío. Inténtalo de nuevo.');
  return `${markdown}\n`;
}

// Redacta el documento recién cerrado. Los anteriores van como contexto para
// mantener nombres y referencias consistentes.
async function generateDocument(state, docIndex) {
  const doc = DOCUMENTS[docIndex];
  const docState = state.docs[docIndex];

  const parts = [projectLine(state), previousDocsBlock(state, docIndex)];
  parts.push(
    `Documento a redactar: ${docLabel(doc)}`,
    `Preguntas base del documento:\n${doc.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
  );
  if (doc.generatorNotes) parts.push(`Instrucciones específicas de este documento:\n${doc.generatorNotes}`);
  parts.push(
    `<entrevista>\n${interviewTranscript(docState)}\n</entrevista>`,
    `<resumen_del_entrevistador>\n${docState.summary}\n</resumen_del_entrevistador>`
  );

  return write(parts.filter(Boolean).join('\n\n'));
}

// Regenera un documento anterior completo aplicando un cambio acordado, para
// que nunca quede una versión desactualizada.
async function regenerateDocument(state, docIndex, change) {
  const doc = DOCUMENTS[docIndex];
  const docState = state.docs[docIndex];

  const parts = [
    projectLine(state),
    `Documento a reescribir: ${docLabel(doc)}`,
    `<version_actual>\n${docState.markdown}\n</version_actual>`,
    `<cambio_acordado>\n${change}\n</cambio_acordado>`,
    'Reescribe el documento completo aplicando el cambio acordado y cualquier ajuste que se derive directamente de él dentro de este documento. ' +
      'Conserva sin cambios todo lo demás: estructura, contenido y redacción.',
  ];
  if (doc.generatorNotes) parts.push(`Instrucciones específicas de este documento:\n${doc.generatorNotes}`);

  return write(parts.filter(Boolean).join('\n\n'));
}

module.exports = { generateDocument, regenerateDocument };
