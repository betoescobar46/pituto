export type Ruta = string
// La hora de cierre de un turno de esta sesión, anotada al terminar (turn.complete).
export type Cierre = { durationMs: number; ms: number }

declare module 'claude-code' {
  interface PluginState {
    'quiet-lines': { transcript: Ruta; vivos: Cierre[] }
  }
}
