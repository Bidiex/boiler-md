require('dotenv').config();
const path = require('path');
const express = require('express');
const { Anthropic, MODEL } = require('./anthropic');
const { ConflictError, InterviewError } = require('./errors');
const engine = require('./interviewer/engine');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1'; // solo localhost en fase A
const MAX_MESSAGE_LENGTH = 8000;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Nunca devolvemos la key, solo si está configurada.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.get('/api/session', (req, res) => {
  res.json(engine.getState());
});

app.post('/api/session/start', async (req, res, next) => {
  try {
    res.json(await engine.start());
  } catch (err) {
    next(err);
  }
});

app.post('/api/session/message', async (req, res, next) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'El mensaje está vacío.' });
  if (text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `El mensaje supera ${MAX_MESSAGE_LENGTH} caracteres.` });
  }
  try {
    res.json(await engine.sendMessage(text));
  } catch (err) {
    next(err);
  }
});

app.post('/api/session/reset', (req, res, next) => {
  try {
    res.json(engine.reset());
  } catch (err) {
    next(err);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Traduce errores a mensajes para el usuario; el detalle técnico queda en la consola del servidor.
app.use((err, req, res, next) => {
  if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
  if (err instanceof InterviewError) return res.status(502).json({ error: err.message });

  console.error(err);
  if (err instanceof Anthropic.AuthenticationError) {
    return res.status(502).json({ error: 'La API key de Anthropic no es válida. Revisa el .env del servidor.' });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return res.status(503).json({ error: 'Límite de uso de la API alcanzado. Espera un momento y reintenta.' });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return res.status(503).json({ error: 'No se pudo conectar con la API de Anthropic. Revisa tu conexión.' });
  }
  if (err instanceof Anthropic.APIError) {
    return res.status(502).json({ error: `Error de la API de Anthropic (${err.status ?? 'sin estado'}). Reintenta.` });
  }
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, HOST, () => {
  console.log(`Entrevistador corriendo en http://localhost:${PORT} (modelo: ${MODEL})`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('Aviso: falta ANTHROPIC_API_KEY en .env');
  }
});
