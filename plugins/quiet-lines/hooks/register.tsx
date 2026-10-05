import type { Register } from 'claude-code'

import { atom, read, update } from 'claude-code'

import { cierrePorDuracion, cierreVivo, duracion, hhmm, leerCierres, resumen } from './lineas'
import type { Cierres } from './lineas'

// Las líneas secundarias del transcript (el resumen de herramientas y el
// cierre del turno) en cursiva tenue, para que resalte la respuesta.
// Más oscuro que el gris tenue del motor, para que se note la diferencia.
const GRIS = '#4b5263'
const TRANSCRIPT = { plugin: 'quiet-lines', key: 'transcript' } as const
// Los cierres de esta sesión, anotados al terminar cada turno; leerlos al dibujar hace que la línea
// se redibuje con su hora cuando el turno termina después de dibujarse.
const vivos = atom({ plugin: 'quiet-lines', key: 'vivos' } as const, [] as { durationMs: number; ms: number }[])

export const register: Register = on => {
  // La ruta del transcript vive en $.state para sobrevivir a una recarga del
  // mod; leerla al dibujar hace que la línea se redibuje cuando llega.
  let leido: { ruta: string; mtime: number } | undefined
  let cierres: Cierres = { porId: new Map(), porDuracion: [] }
  // Qué hora quedó en cada línea, y qué cierres ya tienen dueño: dos turnos de 2 s no comparten hora.
  const vistas = new Map<string, number>()
  const tomadas = new Set<number>()
  // Del transcript solo valen los cierres de antes de cargar el mod; los demás llegan por turn.complete.
  const carga = Date.now()

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const ms = await $.clock.now()
      await update($, vivos, l => [...l.slice(-49), { durationMs: e.durationMs, ms }])
    }
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    const { value } = await $.state.get(TRANSCRIPT)
    if (e.transcript_path && value !== e.transcript_path) await $.state.set(TRANSCRIPT, e.transcript_path)
    return next(e)
  })
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const { value } = await $.state.get(TRANSCRIPT)
    if (e.transcript_path && value !== e.transcript_path) await $.state.set(TRANSCRIPT, e.transcript_path)
    return next(e)
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    // Mientras corre o desplegado, el motor dibuja lo suyo.
    if (e.props.isActive || e.props.isExpanded || !e.props.calls.length) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return <Box marginTop={1} paddingLeft={2}><Text italic color={GRIS}>{resumen(e.props.calls)}</Text></Box>
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const { value: transcript } = await $.state.get(TRANSCRIPT)
    const { durationMs, word } = e.props
    const lista = await read($, vivos)
    let ms = vistas.get(e.requestId)
    if (ms === undefined) ms = cierreVivo(lista, durationMs, tomadas)
    if (ms === undefined && transcript) {
      try {
        const st = await $.fs.stat(transcript)
        if (leido?.ruta !== transcript || leido.mtime !== st.mtimeMs) {
          leido = { ruta: transcript, mtime: st.mtimeMs }
          cierres = leerCierres(await $.fs.read(transcript))
        }
        ms = cierres.porId.get(e.requestId) ?? cierrePorDuracion(cierres, durationMs, tomadas, carga)
      } catch {
        // Sin transcript legible, la línea sale sin hora.
      }
    }
    // Sin cierre todavía (el turno aún no avisa que terminó), la línea sale sin hora en vez de con
    // una inventada; se redibuja cuando llega.
    if (ms !== undefined && !vistas.has(e.requestId)) {
      vistas.set(e.requestId, ms)
      tomadas.add(ms)
    }
    const hora = ms === undefined ? '' : ` · done ${hhmm(ms)}`
    const { Box, Text } = $.ui.resolve(e)
    return <Box marginTop={1}><Text italic color={GRIS}>{`✻ ${word} for ${duracion(durationMs)}${hora}`}</Text></Box>
  })
}
