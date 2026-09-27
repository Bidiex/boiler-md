const { default: Anthropic } = require('@anthropic-ai/sdk');
const { InterviewError } = require('./errors');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

// Se crea al primer uso para que el servidor arranque aunque falte la key.
let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new InterviewError('Falta ANTHROPIC_API_KEY en el .env del servidor.');
  }
  if (!client) client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
  return client;
}

// Todas las llamadas usan streaming para no chocar con timeouts en respuestas largas.
async function createMessage(params) {
  const message = await getClient()
    .messages.stream({
      model: MODEL,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      ...params,
    })
    .finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new InterviewError('El modelo declinó responder. Reformula tu respuesta e inténtalo de nuevo.');
  }
  return message;
}

function textOf(message) {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

module.exports = { Anthropic, MODEL, createMessage, textOf };
