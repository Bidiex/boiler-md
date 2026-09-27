const chat = document.getElementById('chat');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (role === 'assistant' || role === 'user') {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = role === 'assistant' ? 'entrevistador' : 'tú';
    el.appendChild(who);
  }
  el.appendChild(document.createTextNode(text));
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function setBusy(busy) {
  input.disabled = busy;
  sendBtn.disabled = busy;
}

// Auto-crecimiento del textarea
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

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addMessage('user', text);
  input.value = '';
  input.style.height = 'auto';
  // Paso 2: aquí se enviará la respuesta al backend.
  addMessage('system', '[motor de entrevista aún no conectado]');
});

async function init() {
  try {
    const res = await fetch('/api/health');
    const health = await res.json();
    addMessage('system', 'servidor conectado');
    if (!health.apiKeyConfigured) {
      addMessage('error', 'Falta ANTHROPIC_API_KEY en .env del servidor.');
    }
  } catch {
    addMessage('error', 'No se pudo contactar al servidor.');
    setBusy(true);
  }
}

init();
