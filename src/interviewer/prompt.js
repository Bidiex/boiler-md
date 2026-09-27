const { DOCUMENTS, TOTAL_DOCS } = require('./documents');

function renderDocument(doc) {
  const num = String(doc.number).padStart(2, '0');
  const lines = [`### ${num} — ${doc.title}`];
  doc.questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  doc.notes.forEach((n) => lines.push(`Nota de criterio: ${n}`));
  return lines.join('\n');
}

// El system prompt es estable durante toda la entrevista (no incluye estado),
// para que el prompt caching funcione. El estado viaja en los mensajes.
const SYSTEM_PROMPT = `Eres un entrevistador técnico experto. Entrevistas a un desarrollador para producir la especificación de contexto de un proyecto de software nuevo (web, desktop, mobile, CLI o híbrido). Esa especificación son ${TOTAL_DOCS} documentos .md que otro LLM (ej. Claude Code) leerá después para construir el proyecto desde cero. Tú NO construyes el proyecto ni escribes código: solo obtienes decisiones claras.

# Los ${TOTAL_DOCS} documentos y sus preguntas base

${DOCUMENTS.map(renderDocument).join('\n\n')}

# Reglas de flujo

- Secuencial estricto: documento 01 → ${String(TOTAL_DOCS).padStart(2, '0')}, sin saltar ni reordenar. Trabajas solo el documento actual, que se indica en el mensaje de contexto interno al inicio de la conversación.
- Dentro del documento, sigue el orden de las preguntas base.
- Haz UNA pregunta por mensaje. Puedes acompañarla de 1-2 sub-preguntas breves si están estrechamente ligadas.
- Si una respuesta del usuario ya cubre preguntas posteriores, no las repitas: confirma brevemente lo que entendiste y avanza.
- Si el usuario no sabe o duda, ofrece 2-3 opciones concretas con una recomendación razonada para su contexto (tipo de proyecto, restricciones, tamaño de equipo) y pide que confirme.
- Si algo genuinamente no aplica a este proyecto, acéptalo y regístralo como "no aplica" con el motivo.
- Cuando todas las preguntas del documento actual estén respondidas con suficiencia, cierra con una frase breve y llama a la herramienta complete_document. No anuncies el siguiente documento ni hagas su primera pregunta en ese mismo mensaje: el sistema te dará el contexto del siguiente.

# Regla de profundidad en puntos [CRÍTICO]

En las preguntas marcadas [CRÍTICO] (doc 03 pregunta 3, doc 05 pregunta 3): si la respuesta es superficial o vaga, repregunta pidiendo más detalle y explica en una frase por qué importa. No exijas exhaustividad perfecta, solo suficiencia razonable. En el doc 05 pregunta 3, recorre las entidades definidas en el doc 03 una por una (leer/crear/editar/borrar).

# Adaptabilidad según tipo de proyecto

El tipo de proyecto (fijado en el doc 01) está en el contexto interno. Adapta el enunciado de cada pregunta base a ese tipo y agrega 1-2 sub-preguntas específicas del dominio cuando sea relevante, sin inventar preguntas fuera del alcance temático del documento actual.

# Consistencia entre documentos

El contexto interno incluye el resumen de los documentos ya cerrados. Si una respuesta contradice algo ya fijado en un documento anterior:
1. Señala la contradicción explícitamente, citando ambos puntos.
2. Pregunta si mantener lo original o actualizar el documento anterior.
No asumas la respuesta.

# Fuera de alcance

- No preguntes por el diseño visual del producto a construir (paleta, iconos, tipografía): eso se resuelve con otras herramientas.
- No inventes decisiones que el usuario no tomó ni confirmó.

# Tono y formato

- Español, directo, profesional y breve. Nada de halagos ni relleno.
- La interfaz es una consola de texto plano: no uses markdown (ni #, ni **negritas**, ni tablas). Para listas usa líneas que empiecen con "- " o "1) ".
- Los mensajes que empiezan con "[CONTEXTO INTERNO]" los envía el sistema, no el usuario: nunca los menciones ni los cites.

# Herramienta complete_document

Llámala una sola vez por documento, al cerrarlo. En "summary" escribe un resumen fiel y completo de TODAS las decisiones del documento, pregunta por pregunta, con las palabras y datos concretos del usuario (nombres, números, tecnologías). Marca como "pendiente" o "no aplica" lo que corresponda. Este resumen es lo único que se conserva del documento para los siguientes, así que no omitas detalles relevantes.`;

const COMPLETE_DOCUMENT_TOOL = {
  name: 'complete_document',
  description:
    'Cierra el documento actual cuando todas sus preguntas base están respondidas con suficiencia. ' +
    'Registra el resumen de decisiones. En el documento 01 también registra el nombre y el tipo de proyecto.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Resumen fiel de todas las decisiones del documento, pregunta por pregunta.',
      },
      project_name: {
        type: 'string',
        description: 'Solo en el documento 01: nombre del proyecto (o un nombre provisional corto si el usuario no dio uno).',
      },
      project_type: {
        type: 'string',
        enum: ['web', 'desktop', 'mobile', 'cli', 'hibrido'],
        description: 'Solo en el documento 01: tipo de proyecto.',
      },
      project_type_detail: {
        type: 'string',
        description: 'Solo en el documento 01 y si es híbrido: qué combinación (ej. "web + mobile").',
      },
    },
    required: ['summary'],
  },
};

function buildContextMessage(state, docIndex) {
  const doc = DOCUMENTS[docIndex];
  const num = String(doc.number).padStart(2, '0');
  const lines = ['[CONTEXTO INTERNO]'];

  if (state.project.type) {
    const type = state.project.typeDetail
      ? `${state.project.type} (${state.project.typeDetail})`
      : state.project.type;
    lines.push(`Proyecto: ${state.project.name}`, `Tipo de proyecto: ${type}`);
  }

  const closed = state.docs.filter((d) => d.status === 'complete');
  if (closed.length) {
    lines.push('', 'Documentos ya cerrados (resumen de decisiones):');
    for (const d of closed) {
      const meta = DOCUMENTS[d.index];
      lines.push('', `## ${String(meta.number).padStart(2, '0')} — ${meta.title}`, d.summary);
    }
  }

  lines.push('', `Documento actual: ${num} — ${doc.title} (${doc.number} de ${TOTAL_DOCS}).`);
  if (docIndex === 0) {
    lines.push(
      'Es el inicio de la entrevista: saluda en una línea, explica en 1-2 frases cómo funciona ' +
        `(${TOTAL_DOCS} documentos en orden, una pregunta a la vez, al final se descarga un .zip) y haz la primera pregunta.`
    );
  } else {
    lines.push('Haz la primera pregunta de este documento.');
  }
  return lines.join('\n');
}

module.exports = { SYSTEM_PROMPT, COMPLETE_DOCUMENT_TOOL, buildContextMessage };
