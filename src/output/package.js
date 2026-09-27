const JSZip = require('jszip');
const { DOCUMENTS } = require('../interviewer/documents');

const SPEC_DIR = '.project-spec';
const ZIP_NAME = 'project-spec.zip';

// Índice estático de fuentes de verdad (sección 4.5 del spec). Solo cambia el
// nombre del proyecto: la herramienta siempre genera los mismos 9 archivos.
function buildIndex(projectName) {
  return `# Índice de Fuentes de Verdad — ${projectName}

Este archivo es un mapa. No contiene instrucciones de implementación ni convenciones en sí
mismas — solo indica dónde encontrar cada fuente de verdad antes de tomar una decisión.

## Especificación del proyecto

| Necesitas saber sobre... | Consulta |
|---|---|
| Objetivo, alcance, MVP, restricciones | \`${SPEC_DIR}/01-planning.md\` |
| Stack, patrón de app, estructura de carpetas, escala | \`${SPEC_DIR}/02-architecture.md\` |
| Flujos de usuario, entidades, reglas de negocio | \`${SPEC_DIR}/03-logic-and-features.md\` |
| Sistemas base aplicables (notificaciones, admin, RBAC, etc.) | \`${SPEC_DIR}/04-common-systems.md\` |
| Autenticación, autorización, manejo de secretos, superficie de ataque | \`${SPEC_DIR}/05-security.md\` |
| Estrategia de testing, flujos críticos, criterio de "listo para producción" | \`${SPEC_DIR}/06-qa-testing.md\` |
| Convenciones de código, git workflow, estilo | \`${SPEC_DIR}/07-best-practices.md\` |
| Entornos, deploy, monitoreo, backups, rollback | \`${SPEC_DIR}/08-devops-deploy.md\` |
| Checklist de auditoría y red flags a evitar | \`${SPEC_DIR}/09-audit-checklist.md\` |

## Reglas de control

- No asumas ni inventes nada que no esté en las fuentes listadas arriba.
- Si algo no está definido, es ambiguo, o dos fuentes se contradicen entre sí, pregunta
  antes de decidir por tu cuenta.
- Si en el futuro se agregan otras fuentes de verdad al proyecto (ej: convenciones propias
  de un framework, un ADR, documentación externa), este archivo debe actualizarse para
  indexarlas aquí también.
`;
}

// Arma el zip en memoria: nunca se escribe nada en el filesystem del usuario.
async function buildSpecZip(projectName, docs) {
  const zip = new JSZip();
  DOCUMENTS.forEach((doc, i) => {
    zip.file(`${SPEC_DIR}/${doc.file}`, docs[i].markdown);
  });
  const index = buildIndex(projectName);
  zip.file('CLAUDE.md', index);
  zip.file('AGENTS.md', index);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { buildSpecZip, ZIP_NAME };
