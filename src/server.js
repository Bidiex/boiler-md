require('dotenv').config();
const path = require('path');
const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1'; // solo localhost en fase A

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Estado mínimo para que el frontend sepa si el servidor está listo.
// Nunca devolvemos la key, solo si está configurada.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

app.listen(PORT, HOST, () => {
  console.log(`Entrevistador corriendo en http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('Aviso: falta ANTHROPIC_API_KEY en .env');
  }
});
