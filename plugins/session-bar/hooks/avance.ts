// Claude Code no informa cuánto lleva una compactación: el avance se estima por tiempo,
// con el ritmo (ms por mil tokens de contexto) que dejaron las compactaciones anteriores.
export const RITMO_INICIAL = 600
const MINIMO = 5000

export function esperado(tokens: number | undefined, ritmo: number): number {
  return Math.max(MINIMO, ((tokens ?? 100_000) / 1000) * ritmo)
}

// Nunca 100 antes de terminar: si tarda más de lo previsto se queda en 99.
export function porcentaje(transcurrido: number, total: number): number {
  return Math.max(0, Math.min(99, Math.floor((transcurrido / total) * 100)))
}

// Promedio móvil: una compactación rara no desarma la estimación de las siguientes.
export function nuevoRitmo(previo: number, duracion: number, tokens: number): number {
  if (tokens < 1000 || duracion <= 0) return previo
  return Math.round(previo * 0.5 + (duracion / (tokens / 1000)) * 0.5)
}
