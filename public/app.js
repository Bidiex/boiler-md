const chat = document.getElementById('chat');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const resetBtn = document.getElementById('reset');
const progressLabel = document.getElementById('progress-label');
const progressBar = document.getElementById('progress-bar');

let finished = false;

// --- Render ---

function messageEl(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (role === 'assistant' || role === 'user') {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = role === 'assistant' ? 'entrevistador' : 'tú';
    el.appendChild(who);
  }
  el.appendChild(document.createTextNode(text));
  return el;
}

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function addMessage(role, text) {
  const el = messageEl(role, text);
  chat.appendChild(el);
  scrollToBottom();
  return el;
}

function render(state) {
  chat.replaceChildren(
    ...state.transcript.map((m) => messageEl(m.role === 'system' ? 'divider' : m.role, m.text))
  );
  finished = state.status === 'complete';

  if (finished) {
    progressLabel.textContent = `${state.totalDocs} de ${state.totalDocs} documentos · completo`;
    progressBar.style.width = '100%';
    addMessage('system', 'Entrevista completa. La descarga del .zip se habilitará en el siguiente paso.');
  } else {
    const { number, title } = state.currentDoc;
    progressLabel.textContent = `Documento ${number} de ${state.totalDocs} · ${title}`;
    progressBar.style.width = `${(state.completedDocs / state.totalDocs) * 100}%`;
  }
  scrollToBottom();
}

function setBusy(busy) {
  input.disabled = busy || finished;
  sendBtn.disabled = busy || finished;
  resetBtn.disabled = busy;
  if (!busy && !finished) input.focus();
}

// --- API ---

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// Muestra un indicador mientras el modelo responde y re-renderiza con el estado final.
async function runTurn(request) {
  setBusy(true);
  const pending = addMessage('pending', 'pensando');
  try {
    render(await request());
    return true;
  } catch (err) {
    pending.remove();
    addMessage('error', err.message);
    return false;
  } finally {
    setBusy(false);
  }
}

// --- Eventos ---

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return;

  const userEl = addMessage('user', text);
  input.value = '';
  input.style.height = 'auto';

  const ok = await runTurn(() => api('POST', '/api/session/message', { text }));
  if (!ok) {
    // El servidor descartó el turno: devolvemos el texto al input para reintentar.
    userEl.remove();
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }
});

resetBtn.addEventListener('click', async () => {
  if (!confirm('¿Borrar todo el progreso y empezar una entrevista nueva?')) return;
  try {
    render(await api('POST', '/api/session/reset'));
    await runTurn(() => api('POST', '/api/session/start'));
  } catch (err) {
    addMessage('error', err.message);
  }
});

async function init() {
  setBusy(true);
  try {
    const health = await api('GET', '/api/health');
    if (!health.apiKeyConfigured) {
      addMessage('error', 'Falta ANTHROPIC_API_KEY en el .env del servidor. Configúrala y reinicia el servidor.');
      return;
    }
    const state = await api('GET', '/api/session');
    render(state);
    if (!state.transcript.length) {
      await runTurn(() => api('POST', '/api/session/start'));
    } else {
      setBusy(false);
    }
  } catch {
    addMessage('error', 'No se pudo contactar al servidor.');
  }
}

init();
