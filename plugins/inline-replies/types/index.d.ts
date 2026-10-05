// Un trozo citado: el párrafo (o lo marcado con el mouse) y la línea "> …" que lo representa en el prompt.
export type Cita = { id: string; texto: string; pista: string }

declare module 'claude-code' {
  interface PluginState {
    'inline-replies': {
      // Las preguntas ⟦ ⟧ de la última respuesta, con sus alternativas, esperando respuesta.
      preguntas: string[]
      citas: Cita[]
    }
  }
}
