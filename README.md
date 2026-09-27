# spec-interviewer

Webapp local que te entrevista con preguntas estructuradas y genera la spec de contexto de un
proyecto nuevo (web, desktop, mobile, CLI o híbrido): 9 documentos `.md` más `CLAUDE.md` /
`AGENTS.md`, listos para que un LLM constructor (ej. Claude Code) arranque el proyecto.

La herramienta no construye el proyecto ni escribe en tu filesystem: al terminar descargas
`project-spec.zip` y decides dónde descomprimirlo.

## Requisitos

- Node.js 20 o superior
- Una API key de Anthropic

## Uso

```bash
npm install
cp .env.example .env   # y completa ANTHROPIC_API_KEY
npm run dev            # o: npm start
```

Abre http://localhost:3000. El servidor solo escucha en `127.0.0.1`.

## Configuración (`.env`)

| Variable | Default | Descripción |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Obligatoria. Vive solo en el servidor, nunca llega al navegador. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Modelo del entrevistador y del redactor de documentos. |
| `PORT` | `3000` | Puerto local. |

## Cómo funciona

- La entrevista recorre los documentos 01 → 09 en orden, una pregunta a la vez.
- Al cerrar cada documento se redacta su `.md` (oculto hasta el final). El siguiente documento
  arranca con los `.md` anteriores como contexto.
- Si una respuesta contradice un documento anterior, el entrevistador lo señala y, si confirmas
  el cambio, regenera ese documento completo.
- El progreso se guarda en `data/session.json` tras cada turno: si cierras el navegador,
  retomas donde estabas. "reiniciar" lo borra.
- Al completar los 9 documentos se habilita la descarga de `project-spec.zip`:

```
project-spec.zip
├── .project-spec/
│   ├── 01-planning.md … 09-audit-checklist.md
├── CLAUDE.md
└── AGENTS.md
```

## Estructura del código

```
src/
├── server.js               # Express: API, estáticos e iconos
├── anthropic.js            # cliente y llamada común a la API
├── errors.js               # errores con mensaje para el usuario
├── store.js                # persistencia atómica de la sesión
├── interviewer/
│   ├── documents.js        # los 9 documentos: preguntas, notas, catálogos (fuente única)
│   ├── prompt.js           # system prompt, herramientas y mensaje de contexto
│   ├── engine.js           # estado y turnos de la entrevista
│   └── generator.js        # redacción y regeneración de cada .md
└── output/
    └── package.js          # CLAUDE.md/AGENTS.md y el zip
public/                     # UI vanilla (HTML/CSS/JS)
```
