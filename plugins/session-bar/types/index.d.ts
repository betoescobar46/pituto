export type Quien = 'yo' | 'claude'
export type Mensaje = { quien: Quien; texto: string }
export type Modo = 'contexto' | 'suelta'

declare module 'claude-code' {
  interface PluginState {
    // Del mod inline-replies (inline-replies); session-bar solo lo lee.
    'inline-replies': { preguntas: string[]; citas: { id: string; texto: string; pista: string }[] }
    'session-bar': {
      mensajes: Mensaje[]
      modo: Modo
      pendientes: number
      borrador: string
      abierto: boolean
      sinLeer: boolean
      compactar: 'listo' | 'confirmar' | 'compactando'
      avance: number | null
      borrar: 'listo' | 'confirmar' | 'borrando'
      colorSesion: number | null
      esfuerzo: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
      menuModelo: boolean
      modeloClic: string | null
      fotoDefault: { ruta: string; claves: Record<string, unknown> } | null
      medida: { modelo: string; contexto: number | null; limite: number | null }
    }
  }
}
