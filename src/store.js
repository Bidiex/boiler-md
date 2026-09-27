const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');

function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`No se pudo leer ${SESSION_FILE}, se inicia una entrevista nueva:`, err.message);
    }
    return null;
  }
}

// Escritura atómica: si el proceso muere a medio escribir, no se corrompe el progreso.
function saveSession(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${SESSION_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, SESSION_FILE);
}

function deleteSession() {
  fs.rmSync(SESSION_FILE, { force: true });
}

module.exports = { loadSession, saveSession, deleteSession };
