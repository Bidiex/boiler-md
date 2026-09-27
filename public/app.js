const chat = document.getElementById('chat');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const resetBtn = document.getElementById('reset');
const progressLabel = document.getElementById('progress-label');
const progressBar = document.getElementById('progress-bar');
const done = document.getElementById('done');
const helper = document.getElementById('helper');

const DEFAULT_PLACEHOLDER = input.placeholder;
const ACTIVITY_POLL_MS = 800;

// Opciones de stack para la primera respuesta del doc 02 (slugs de Simple Icons).
const STACK_OPTIONS = [
  ['Frontend', [
    ['HTML/CSS/JS vanilla', 'html5'], ['TypeScript', 'typescript'], ['React', 'react'], ['Vue', 'vuedotjs'],
    ['Svelte', 'svelte'], ['Angular', 'angular'], ['Next.js', 'nextdotjs'], ['Nuxt', 'nuxt'],
    ['Astro', 'astro'], ['Vite', 'vite'], ['Tailwind CSS', 'tailwindcss'],
  ]],
  ['Backend', [
    ['Node.js', 'nodedotjs'], ['Express', 'express'], ['Bun', 'bun'], ['Deno', 'deno'], ['Python', 'python'],
    ['FastAPI', 'fastapi'], ['Django', 'django'], ['PHP', 'php'], ['Laravel', 'laravel'], ['Go', 'go'],
    ['Rust', 'rust'], ['.NET', 'dotnet'],
  ]],
  ['Datos / BaaS', [
    ['Supabase', 'supabase'], ['Firebase', 'firebase'], ['PostgreSQL', 'postgresql'], ['MySQL', 'mysql'],
    ['SQLite', 'sqlite'], ['MongoDB', 'mongodb'], ['Redis', 'redis'], ['Prisma', 'prisma'],
  ]],
  ['Mobile / Desktop', [
    ['React Native', 'react'], ['Expo', 'expo'], ['Flutter', 'flutter'], ['Swift', 'swift'], ['Kotlin', 'kotlin'],
    ['Capacitor', 'capacitor'], ['Electron', 'electron'], ['Tauri', 'tauri'],
  ]],
  ['Hosting / Servicios', [
    ['Vercel', 'vercel'], ['Netlify', 'netlify'], ['Cloudflare', 'cloudflare'], ['Railway', 'railway'],
    ['Render', 'render'], ['Docker', 'docker'], ['Stripe', 'stripe'], ['Clerk', 'clerk'], ['Auth0', 'auth0'],
  ]],
];

const DIVIDER_ICONS = { 'doc-start': 'file-text', 'doc-updated': 'rotate-ccw', complete: 'circle-check' };

let finished = false;
let busy = false;
// Ayuda activa: { kind, selected: Set, items? } o null
let activeHelper = null;

// --- Utilidades DOM ---

function icon(url, extraClass) {
  const el = document.createElement('span');
  el.className = extraClass ? `icon ${extraClass}` : 'icon';
  el.style.setProperty('--icon', `url(${url})`);
  el.setAttribute('aria-hidden', 'true');
  return el;
}
const uiIcon = (name) => icon(`/icons/ui/${name}.svg`);
const brandIcon = (slug) => icon(`/icons/brands/${slug}.svg`);

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

// --- Mensajes ---

function messageEl(entry) {
  const el = document.createElement('div');

  if (entry.role === 'system') {
    el.className = `msg divider ${entry.kind || ''}`;
    if (DIVIDER_ICONS[entry.kind]) el.appendChild(uiIcon(DIVIDER_ICONS[entry.kind]));
    el.appendChild(document.createTextNode(entry.text));
    return el;
  }

  el.className = `msg ${entry.role}`;
  if (entry.role === 'assistant' || entry.role === 'user') {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = entry.role === 'assistant' ? 'entrevistador' : 'tú';
    el.appendChild(who);
  }
  if (entry.role === 'error') el.appendChild(uiIcon('triangle-alert'));
  el.appendChild(document.createTextNode(entry.text));
  return el;
}

function addMessage(role, text) {
  const el = messageEl({ role, text });
  chat.appendChild(el);
  scrollToBottom();
  return el;
}

// --- Indicador de actividad ---

function activityText(activity) {
  if (!activity) return 'pensando';
  const doc = activity.doc && `documento ${activity.doc.number} · ${activity.doc.title}`;
  if (activity.kind === 'writing') return `redactando ${doc}`;
  if (activity.kind === 'updating') return `actualizando ${doc}`;
  return 'pensando';
}

function showPending() {
  const el = document.createElement('div');
  el.className = 'msg pending';
  el.appendChild(uiIcon('loader'));
  const label = document.createElement('span');
  label.textContent = 'pensando';
  el.appendChild(label);
  chat.appendChild(el);
  scrollToBottom();

  const timer = setInterval(async () => {
    try {
      const { activity } = await api('GET', '/api/session/activity');
      label.textContent = activityText(activity);
    } catch {
      // un fallo de sondeo no afecta al turno en curso
    }
  }, ACTIVITY_POLL_MS);

  return () => {
    clearInterval(timer);
    el.remove();
  };
}

// --- Ayudas de entrada ---

function renderHelper(spec) {
  helper.replaceChildren();
  activeHelper = null;
  helper.hidden = !spec;
  input.placeholder = DEFAULT_PLACEHOLDER;
  if (!spec) return;

  activeHelper = { kind: spec.kind, items: spec.items, selected: new Set() };
  if (spec.kind === 'checklist') renderChecklist(spec.items);
  else if (spec.kind === 'stack') renderStackChips();
  input.placeholder = 'Comentario opcional… (Enter envía la selección)';
}

function helperTitle(html) {
  const el = document.createElement('div');
  el.className = 'helper-title';
  el.innerHTML = html;
  helper.appendChild(el);
  return el;
}

function renderChecklist(items) {
  const title = helperTitle('');
  const updateTitle = () => {
    title.innerHTML = `Marca los sistemas base que aplican · <strong>${activeHelper.selected.size}</strong> de ${items.length}`;
  };
  updateTitle();

  const grid = document.createElement('div');
  grid.className = 'checklist';
  items.forEach((label, i) => {
    const row = document.createElement('label');
    row.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    const boxIcon = uiIcon('square');
    boxIcon.classList.add('box');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = `${i + 1})`;
    const text = document.createElement('span');
    text.textContent = label;

    box.addEventListener('change', () => {
      if (box.checked) activeHelper.selected.add(i);
      else activeHelper.selected.delete(i);
      row.classList.toggle('on', box.checked);
      boxIcon.style.setProperty('--icon', `url(/icons/ui/${box.checked ? 'square-check' : 'square'}.svg)`);
      updateTitle();
    });

    row.append(box, boxIcon, num, text);
    grid.appendChild(row);
  });
  helper.appendChild(grid);
}

function renderStackChips() {
  const title = helperTitle('');
  const updateTitle = () => {
    const n = activeHelper.selected.size;
    title.innerHTML = `Opcional: marca tu stack${n ? ` · <strong>${n}</strong> seleccionadas` : ''} (también puedes escribirlo)`;
  };
  updateTitle();

  for (const [group, options] of STACK_OPTIONS) {
    const section = document.createElement('div');
    section.className = 'chip-group';
    const label = document.createElement('div');
    label.className = 'chip-group-label';
    label.textContent = group;
    const chips = document.createElement('div');
    chips.className = 'chips';

    for (const [name, slug] of options) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('aria-pressed', 'false');
      chip.append(brandIcon(slug), document.createTextNode(name));
      chip.addEventListener('click', () => {
        const on = !activeHelper.selected.has(name);
        if (on) activeHelper.selected.add(name);
        else activeHelper.selected.delete(name);
        chip.setAttribute('aria-pressed', String(on));
        updateTitle();
      });
      chips.appendChild(chip);
    }
    section.append(label, chips);
    helper.appendChild(section);
  }
}

// Combina la selección de la ayuda con el texto libre en un solo mensaje.
function composeMessage(freeText) {
  if (!activeHelper) return freeText;

  if (activeHelper.kind === 'checklist') {
    const { items, selected } = activeHelper;
    const yes = items.map((label, i) => [i, label]).filter(([i]) => selected.has(i));
    const no = items.map((label, i) => [i, label]).filter(([i]) => !selected.has(i));
    const lines = yes.length
      ? ['Sistemas base que aplican:', ...yes.map(([i, l]) => `- ${i + 1}) ${l}`)]
      : ['Ninguno de los sistemas base aplica.'];
    if (yes.length && no.length) lines.push(`No aplican: ${no.map(([i]) => i + 1).join(', ')}`);
    if (freeText) lines.push('', freeText);
    return lines.join('\n');
  }

  if (activeHelper.kind === 'stack' && activeHelper.selected.size) {
    const line = `Stack: ${[...activeHelper.selected].join(', ')}`;
    return freeText ? `${line}\n\n${freeText}` : line;
  }
  return freeText;
}

// --- Estado general ---

function render(state) {
  chat.replaceChildren(...state.transcript.map(messageEl));
  finished = state.status === 'complete';
  form.hidden = finished;
  done.hidden = !finished;
  renderHelper(state.inputHelper);

  if (finished) {
    progressLabel.textContent = `${state.totalDocs} de ${state.totalDocs} documentos · completo`;
    progressBar.style.width = '100%';
  } else {
    const { number, title } = state.currentDoc;
    progressLabel.textContent = `Documento ${number} de ${state.totalDocs} · ${title}`;
    progressBar.style.width = `${(state.completedDocs / state.totalDocs) * 100}%`;
  }
  scrollToBottom();
}

function setBusy(value) {
  busy = value;
  input.disabled = value || finished;
  sendBtn.disabled = value || finished;
  resetBtn.disabled = value;
  helper.querySelectorAll('input, button').forEach((el) => { el.disabled = value; });
  if (!value && !finished) input.focus();
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

// Muestra el indicador mientras el servidor trabaja y re-renderiza con el estado final.
async function runTurn(request) {
  setBusy(true);
  const hidePending = showPending();
  try {
    const state = await request();
    hidePending();
    render(state);
    return true;
  } catch (err) {
    hidePending();
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
  if (busy || finished) return;
  const freeText = input.value.trim();
  // La checklist se puede enviar vacía ("ninguno aplica"); el resto necesita contenido.
  if (!freeText && activeHelper?.kind !== 'checklist' && !activeHelper?.selected.size) return;

  const text = composeMessage(freeText);
  const userEl = addMessage('user', text);
  input.value = '';
  input.style.height = 'auto';

  const ok = await runTurn(() => api('POST', '/api/session/message', { text }));
  if (!ok) {
    // El servidor descartó el turno: devolvemos el texto libre al input para reintentar
    // (la selección de la ayuda sigue marcada).
    userEl.remove();
    input.value = freeText;
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
