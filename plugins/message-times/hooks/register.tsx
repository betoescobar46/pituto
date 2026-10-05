import type { Register } from 'claude-code'

import { hhmm, leerHoras } from './horas'
import type { Horas } from './horas'

export const register: Register = on => {
  let transcript: string | undefined
  let leidoMtime = -1
  let horas: Horas = { porId: new Map(), porTexto: new Map() }
  // Lo que se dibujó antes de que el transcript lo tuviera: la hora del
  // primer dibujo, que es la del envío.
  const vistas = new Map<string, number>()

  // Devuelve true si la ruta del transcript cambió.
  const conocer = (ruta: string): boolean => {
    if (!ruta || ruta === transcript) return false
    transcript = ruta
    leidoMtime = -1
    return true
  }
  on('classic.SessionStart', ($, e, next) => {
    if (conocer(e.transcript_path)) $.ui.invalidate('ui.render')
    return next(e)
  })
  on('classic.UserPromptSubmit', ($, e, next) => {
    if (conocer(e.transcript_path)) $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const id = e.requestId
    const texto = e.props.text.trim()
    let ms = horas.porId.get(id) ?? horas.porTexto.get(texto) ?? vistas.get(id)
    if (ms === undefined && transcript) {
      try {
        const st = await $.fs.stat(transcript)
        if (st.mtimeMs !== leidoMtime) {
          leidoMtime = st.mtimeMs
          horas = leerHoras(await $.fs.read(transcript))
          ms = horas.porId.get(id) ?? horas.porTexto.get(texto)
        }
      } catch {
        // Sin transcript legible: se usa la hora de dibujo.
      }
    }
    if (ms === undefined) {
      if (!transcript) return next(e)
      ms = await $.clock.now()
      vistas.set(id, ms)
    }
    return next({ ...e, props: { ...e.props, text: `[${hhmm(ms)}] ${e.props.text}` } })
  })
}
