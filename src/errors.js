// Errores con mensaje apto para mostrar al usuario.

// La petición choca con el estado actual (turno en curso, entrevista terminada) → 409.
class ConflictError extends Error {}

// Fallo recuperable de la entrevista (respuesta inválida del modelo, config faltante) → 502.
class InterviewError extends Error {}

module.exports = { ConflictError, InterviewError };
