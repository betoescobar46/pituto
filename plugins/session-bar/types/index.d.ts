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
      esfuerzoSesion: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
      modeloSesion: 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-fable-5-1' | 'claude-haiku-4-5-20251001' | null
      menuModelo: boolean
      medida: { modelo: string; contexto: number | null; limite: number | null }
    }
  }
}
