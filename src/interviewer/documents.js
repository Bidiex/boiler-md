// Estructura de los 9 documentos (sección 3 del spec).
// Es la única fuente de verdad: el system prompt, el motor, la UI y el zip leen de aquí.

// Catálogo de sistemas base del doc 04. La UI lo muestra como checkboxes.
const COMMON_SYSTEMS = [
  'Notificaciones transitorias (toasts/alerts)',
  'Centro de notificaciones persistente (leído/no leído)',
  'Precios/planes configurables por admin sin tocar código',
  'Panel de administración (rol admin separado)',
  'Búsqueda y filtros',
  'Permisos y roles (RBAC)',
  'Auditoría/logs de actividad',
  'Configuración/feature flags',
  'Onboarding (tours, tooltips, checklist de primeros pasos)',
  'Exportación de datos (CSV, PDF, backups descargables)',
  'Comentarios/feedback interno entre usuarios',
  'Suscripciones/facturación recurrente',
];

const DOCUMENTS = [
  {
    number: 1,
    title: 'Planning',
    file: '01-planning.md',
    questions: [
      'Tipo de proyecto (web / desktop / mobile / CLI / híbrido) — define la adaptación de todo lo demás',
      'Problema que resuelve (el dolor específico, no la lista de features)',
      'Usuario objetivo (quién lo usa, nivel técnico, uso personal/interno/comercial)',
      'Alcance del MVP (3-5 funciones sin las que no tiene sentido lanzar)',
      'Fuera de alcance explícito (qué NO va en v1, para evitar scope creep)',
      'Restricciones reales (tiempo, solo/equipo, presupuesto/free-tier)',
      'Vida esperada del proyecto (experimento descartable / MVP a validar / escalable en serio)',
      'Plataformas/dispositivos objetivo',
    ],
    notes: [
      'Al cerrar este documento debes reportar el nombre del proyecto y el tipo de proyecto en la herramienta complete_document.',
    ],
  },
  {
    number: 2,
    title: 'Architecture',
    file: '02-architecture.md',
    quickPick: 'stack', // la UI ofrece chips de tecnologías para la primera respuesta
    questions: [
      'Stack técnico (usar el que el usuario ya tenga, o sugerir según tipo/restricciones)',
      'Patrón de aplicación (web: SPA/MPA/SSR-híbrido; mobile: nativo/cross-platform; desktop: Electron/Tauri/nativo)',
      'Backend y datos (backend propio vs BaaS; tipo de datos: relacional, documentos, tiempo real)',
      'Autenticación (necesidad, roles, proveedor)',
      'Estructura de carpetas (monorepo vs single package; por feature vs por tipo de archivo)',
      'Estado y comunicación de datos entre partes de la app',
      'Dependencias externas críticas (APIs de terceros, SDKs, servicios pagos)',
      'Expectativa de escala (usuarios/requests esperados a 6 meses)',
    ],
    notes: [
      'Si el usuario ya tiene stack fijo, respétalo sin cuestionar, salvo fricción genuina con el tipo de proyecto: señálala una sola vez y respeta la decisión del usuario.',
    ],
  },
  {
    number: 3,
    title: 'Logic and Features',
    file: '03-logic-and-features.md',
    questions: [
      'Flujos de usuario principales (2-3 flujos completos de punta a punta, no lista de features sueltas)',
      'Entidades y datos centrales, y cómo se relacionan entre sí',
      '[CRÍTICO] Reglas de negocio no obvias (lógica más allá de CRUD simple: cálculos, validaciones de dominio, condiciones de propiedad/permiso)',
      'Estados y transiciones (qué pasa por distintos estados y qué dispara cada cambio)',
      'Casos límite conocidos de antemano',
      'Integraciones funcionales (APIs externas que alimentan la lógica, no solo infraestructura)',
      'Notificaciones y comunicación (qué avisa el sistema, cuándo, por qué medio)',
      'Diferenciador (qué hace única a esta app frente a algo similar existente)',
    ],
    notes: [],
  },
  {
    number: 4,
    title: 'Common Systems',
    file: '04-common-systems.md',
    questions: [
      'Presenta el catálogo de sistemas base para que el usuario marque cuáles aplican ' +
        '(la interfaz le muestra checkboxes; tú solo introduce la selección en una o dos frases, sin repetir la lista completa): ' +
        COMMON_SYSTEMS.map((s, i) => `${i + 1}) ${s}`).join('; '),
      'Para cada sistema marcado como aplicable, pregunta el detalle específico de ese sistema',
    ],
    checklist: COMMON_SYSTEMS,
    notes: [
      'Estos son sistemas de infraestructura funcional, distintos de las features del dominio de negocio. ' +
        'Ejemplo: un sistema de descuentos propio del catálogo de un ecommerce pertenece al doc 03; aquí solo entra si es el admin configurando promociones globales de la plataforma.',
    ],
    generatorNotes:
      'Estructura: primero una tabla resumen con los 12 sistemas del catálogo (columnas: #, Sistema, ¿Aplica? [Sí/No], Nota breve). ' +
      'Después, una sección "##" por cada sistema marcado como aplicable, con el detalle acordado en la entrevista. ' +
      'Los sistemas que no aplican solo aparecen en la tabla.',
  },
  {
    number: 5,
    title: 'Security',
    file: '05-security.md',
    questions: [
      'Sensibilidad de los datos (personales, financieros, salud, info crítica de negocio)',
      'Modelo de autenticación en detalle (duración de sesión, 2FA, recuperación de contraseña)',
      '[CRÍTICO] Autorización granular por entidad de datos (quién puede leer/crear/editar/borrar cada entidad definida en el doc 03) — alimenta directamente políticas RLS si aplica',
      'Manejo de secretos (qué keys/tokens existen, dónde viven — nunca en frontend/repo)',
      'Validación de inputs (qué formularios/endpoints reciben datos externos; validación en cliente Y servidor)',
      'Superficie de ataque específica según el tipo de proyecto',
      'Rate limiting y abuso (endpoints sensibles a spam: login, formularios públicos, IA/APIs costosas)',
      'Cumplimiento normativo (GDPR, datos de menores, requisitos por país/industria)',
      'Plan ante incidente (pasos mínimos si hay brecha o filtración)',
    ],
    notes: [
      'Superficie de ataque por tipo de proyecto (referencia): ' +
        'Web → uploads de archivos, contenido generado por usuarios (XSS), configuración CORS. ' +
        'Mobile → almacenamiento seguro en dispositivo, riesgo de deep links. ' +
        'Desktop → acceso al filesystem del usuario, riesgo de supply chain en auto-updates. ' +
        'CLI → sanitización de inputs vía flags/stdin, riesgo de inyección de shell.',
    ],
  },
  {
    number: 6,
    title: 'QA & Testing',
    file: '06-qa-testing.md',
    questions: [
      'Nivel de criticidad del proyecto (retomado del doc 01) — determina el rigor de testing aplicable',
      'Flujos críticos que no pueden fallar (de los definidos en el doc 03)',
      'Tipo de testing a aplicar (unitario/integración/E2E, según criticidad y tamaño de equipo)',
      'Casos límite ya identificados (retomados del doc 03) y comportamiento esperado explícito',
      'Manejo de errores esperado (de cara al usuario vs. de cara al desarrollador/logs)',
      'Testing de seguridad básico (verificar que las políticas de permisos del doc 05 realmente bloquean)',
      'Criterio de "listo para producción" (checklist mínimo — semilla del doc 09)',
      'Testing en dispositivos/entornos reales (dispositivos físicos/simuladores para mobile; navegadores/tamaños de pantalla para web)',
    ],
    notes: [
      'Para un desarrollador solo (sin equipo de QA), inclina la recomendación hacia testing pragmático (E2E de flujos críticos + validación manual estructurada), no cobertura exhaustiva.',
    ],
  },
  {
    number: 7,
    title: 'Best Practices',
    file: '07-best-practices.md',
    questions: [
      'Convenciones de nombres (camelCase/snake_case/kebab-case por tipo de elemento)',
      'Organización del código (confirmar la decisión del doc 02: por tipo de archivo vs por feature)',
      'Linting y formateo (herramienta, nivel de estrictez)',
      'Comentarios y documentación inline (nivel según si otros van a leer el código)',
      'Manejo de errores como patrón consistente (try/catch, result objects, excepciones)',
      'Git workflow (commits directos vs ramas+PRs, convención de mensajes)',
      'Nivel de abstracción tolerado (código directo/duplicado vs abstracción temprana)',
      'Gestión de dependencias (criterio para agregar una librería nueva)',
      'Idioma del código (nombres de variables/funciones, comentarios)',
    ],
    notes: [],
  },
  {
    number: 8,
    title: 'DevOps & Deploy',
    file: '08-devops-deploy.md',
    questions: [
      'Entornos (local/staging/producción, o solo local/producción)',
      'Proceso de deploy (manual vs automatizado CI/CD)',
      'Plataforma de hosting (confirmar/detallar desde el doc 02)',
      'Variables de entorno por ambiente',
      'Monitoreo y logs (cómo se detectan fallos en producción)',
      'Estrategia de backups (si hay base de datos)',
      'Plan de rollback',
      'Dominio y DNS (dominio propio, certificados SSL)',
      'Costos de infraestructura esperados (free-tier vs presupuesto)',
    ],
    notes: [
      'Si el stack ya resuelve algo por defecto (ej: Vercel + Supabase dan SSL automático, deploy por git push, backups gestionados), detéctalo y confírmalo en vez de repreguntar como si no existiera solución.',
    ],
  },
  {
    number: 9,
    title: 'Audit Checklist',
    file: '09-audit-checklist.md',
    questions: [
      'Etapa actual del proyecto (recién iniciando / a medio camino / terminado)',
      'Si ya hay código: ¿generar la auditoría ahora (spec-only) o después de una primera versión construida?',
    ],
    notes: [
      'Este documento NO se llena con preguntas abiertas: se arma combinando los criterios de éxito ya definidos en los docs 01-08 más red flags universales. ' +
        'Solo haz las 2 preguntas de cierre listadas y luego cierra el documento.',
    ],
    generatorNotes: `No sigas la estructura de "una sección por pregunta". Arma el checklist con estas 4 secciones, usando casillas "- [ ]" y criterios verificables y concretos de ESTE proyecto (cita entidades, flujos, sistemas y decisiones de los docs 01-08 por su nombre):

## A — Completitud de la spec (antes de tocar código)
Deriva los ítems de los docs 01-08. Como mínimo:
- Cada documento con sus puntos clave respondidos, sin vacíos (lista explícitamente los puntos que quedaron "pendiente")
- Reglas de negocio no obvias (doc 03) explícitas, no asumidas
- Autorización granular (doc 05) definida por cada entidad de datos (lista cada entidad)

## B — Red flags universales (con código ya avanzado)
Incluye siempre estos 8, adaptando la redacción al stack del proyecto:
- Secretos hardcodeados en frontend
- Sin validación de inputs ("confiar en el cliente")
- Sin manejo de errores (crashes silenciosos o errores crudos expuestos)
- Cero tests, "funciona en mi máquina"
- Sin backups, sin plan de rollback
- Estados de carga/error inconsistentes o ausentes
- Acceso directo a datos sin reglas de permisos (sin RLS o equivalente)
- Sin monitoreo (los problemas los descubren los usuarios, no el equipo)

## C — Cumplimiento contra la spec propia
- Un ítem por cada sistema base marcado como aplicable en el doc 04: ¿implementado?
- Un ítem por cada flujo crítico del doc 06: ¿tiene algún tipo de test o verificación?
- Un ítem por cada función del MVP del doc 01: ¿completa?
- Un ítem por cada elemento "fuera de alcance" del doc 01: ¿se mantuvo fuera?
- Los criterios de "listo para producción" del doc 06

## D — Estado y momento de la auditoría
Registra las respuestas de cierre del usuario: etapa actual del proyecto y si la auditoría se aplica ahora (spec-only) o después de una primera versión construida.`,
  },
];

module.exports = { DOCUMENTS, TOTAL_DOCS: DOCUMENTS.length };
