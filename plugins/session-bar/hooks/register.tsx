import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelForkResult, Register } from 'claude-code'

import type { Mensaje, Modo } from '../types'
import { PALETA, SIN_COLOR, carpeta, colorPorCarpeta, leerFijos, scriptAplicar, siguiente } from './color'
import type { Fijo } from './color'
import { LETRA, NIVELES, esNivel, nivelDeArgs, nivelDeSettings } from './effort'
import type { Nivel } from './effort'
import { motivoBloqueo } from './guardia'
import { pistaCorta } from './pista'
import { colorContexto, colorLimite, modeloCorto } from './medidor'
import { MODELOS, mismoModelo, modeloPedido } from './modelo'
import { RITMO_INICIAL, esperado, nuevoRitmo, porcentaje } from './avance'
import { idiomaDe, textos } from './idioma'
import type { Idioma } from './idioma'
import type { Modelo } from './modelo'

const PANE = 'session-bar'
const VISIBLES = 6

const mensajes = atom({ plugin: 'session-bar', key: 'mensajes' } as const, [] as Mensaje[])
const modo = atom({ plugin: 'session-bar', key: 'modo' } as const, 'contexto' as Modo)
// Preguntas en curso (incluye las que esperan a un subagente). Un contador y no un
// booleano: así una pregunta que falla no deja el panel bloqueado para las siguientes.
const pendientes = atom({ plugin: 'session-bar', key: 'pendientes' } as const, 0)
const borrador = atom({ plugin: 'session-bar', key: 'borrador' } as const, '')
const abierto = atom({ plugin: 'session-bar', key: 'abierto' } as const, false)
// Llegó una respuesta con el panel cerrado: el botón lo muestra hasta que se abra.
const sinLeer = atom({ plugin: 'session-bar', key: 'sinLeer' } as const, false)
// Color de la sesión: índice en PALETA, SIN_COLOR, o null si todavía no se eligió (se
// asigna solo según la carpeta la primera vez).
const colorSesion = atom({ plugin: 'session-bar', key: 'colorSesion' } as const, null as number | null)
// Botón compactar: el primer clic pide confirmación (5 s), el segundo compacta.
const compactar = atom({ plugin: 'session-bar', key: 'compactar' } as const, 'listo' as 'listo' | 'confirmar' | 'compactando')
// Botón /clear: igual que compactar, dos clics; borrar la conversación no tiene vuelta.
// Porcentaje estimado de la compactación en curso (sea del botón, de /compact o automática); null sin compactar.
const avance = atom({ plugin: 'session-bar', key: 'avance' } as const, null as number | null)
const borrar = atom({ plugin: 'session-bar', key: 'borrar' } as const, 'listo' as 'listo' | 'confirmar' | 'borrando')
// Effort de esta sesión, o null mientras no se sepa (el botón dice "effort").
const esfuerzo = atom({ plugin: 'session-bar', key: 'esfuerzo' } as const, null as Nivel | null)
// El nivel elegido en la barra: solo vale para esta sesión (turn.step lo pone en cada pedido). null = el de Claude Code.
const esfuerzoSesion = atom({ plugin: 'session-bar', key: 'esfuerzoSesion' } as const, null as Nivel | null)
// La barra de effort muestra solo el nivel actual hasta que se despliega.
// Modelo elegido en el desplegable: solo vale para esta sesión (turn.step lo pone en cada pedido). null = el de Claude Code.
// Cómo se enciende un botón de la barra bajo el mouse: así se distingue de los datos.
// Fondo de tecla: marca en reposo lo que se puede clicar, sin corchetes.
const TECLA = '#363b44'
const ENCENDIDO = { color: 'cyanBright', bold: true, underline: true } as const
const modeloSesion = atom({ plugin: 'session-bar', key: 'modeloSesion' } as const, null as Modelo | null)
const menuModelo = atom({ plugin: 'session-bar', key: 'menuModelo' } as const, false)
// Lo que antes mostraba la status line: modelo abreviado, % de contexto y % del límite de 5 h.
const medida = atom({ plugin: 'session-bar', key: 'medida' } as const, { modelo: '', contexto: null, limite: null } as Medida)
// Las citas son del mod inline-replies; aquí solo se mira si existe el estado para dibujar su botón +.
// undefined = ese mod no está cargado, y el botón no aparece.
const citasDialogo = { plugin: 'inline-replies', key: 'citas' } as const

// Idioma del panel y de los pedidos al modelo (opción `language`, settings.language o LANG), y
// la frase extra de la opción `persona` para el modo suelta ("The user is a cardiologist…").
let idioma: Idioma = 'es'
let persona = ''
// Colores fijos por carpeta (opción `folderColors`).
let fijos: Fijo[] = []
const t = () => textos(idioma)
let opcionIdioma: unknown

async function elegirIdioma($: EngineInterface) {
  const ajustes = (await $.settings.read().catch(() => ({}))) as Record<string, unknown>
  idioma = idiomaDe(opcionIdioma, ajustes.language, await $.env.get('LANG').catch(() => undefined))
}

const historial = (lista: Mensaje[]): string =>
  lista
    .slice(-VISIBLES)
    .map(m => `${m.quien === 'yo' ? t().usuario : t().tu}: ${m.texto}`)
    .join('\n')

// Subagentes lanzados por el panel: los que todavía no responden y los ya respondidos.
const enCurso = new Set<string>()
const respondidos = new Set<string>()
const LIMITE_AGENTE = 8 * 60 * 1000
// En una sesión no interactiva (claude -p en scripts) el panel no existe: el mod no hace nada.
let activo = true
// Si Claude está trabajando (lo dice la línea de pista), no se puede compactar.
let trabajando = false

const mios = async ($: EngineInterface): Promise<string[]> =>
  (await $.agent.list()).filter(a => a.spawnedBy === 'session-bar').map(a => a.id)

const esMio = async ($: EngineInterface, id: string): Promise<boolean> =>
  enCurso.has(id) || respondidos.has(id) || (await mios($)).includes(id)

const cambiarPendientes = ($: EngineInterface, d: number) => update($, pendientes, n => Math.max(0, n + d))

// Registro de diagnóstico: fuera de la carpeta del mod, que Claude Code vigila y recarga.
// Varias sesiones escriben el mismo archivo: se lee lo que hay y se anexa (últimas 500 líneas).
let cola: Promise<void> = Promise.resolve()
const anotar = ($: EngineInterface, texto: string): Promise<void> => {
  cola = cola.then(async () => {
    const home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
    if (!home) return
    const registro = `${home}/.claude/session-bar.log`
    const previo = await $.fs.read(registro).catch(() => '')
    const lineas = `${previo}${new Date().toISOString()} ${texto}\n`.split('\n').slice(-501)
    await $.fs.write(registro, lineas.join('\n'))
  }).catch(() => undefined)
  return cola
}

async function agregar($: EngineInterface, quien: Mensaje['quien'], texto: string): Promise<void> {
  await update($, mensajes, l => [...l, { quien, texto }].slice(-40))
  if (quien === 'claude' && !(await read($, abierto))) {
    await update($, sinLeer, () => true)
    $.ui.toast(t().llegoRespuesta)
  }
}

async function responder($: EngineInterface, id: string, texto: string): Promise<void> {
  if (respondidos.has(id)) return
  respondidos.add(id)
  const estaba = enCurso.delete(id)
  await agregar($, 'claude', texto)
  if (estaba) await cambiarPendientes($, -1)
}

// Un subagente que no responde no puede dejar el panel en "buscando" para siempre.
async function vencer($: EngineInterface, id: string): Promise<void> {
  if (!enCurso.delete(id)) return
  await anotar($, `vencido ${id}`)
  await agregar($, 'claude', t().agenteVencido)
  await cambiarPendientes($, -1)
}

function seguir($: EngineInterface, id: string): void {
  if (enCurso.has(id) || respondidos.has(id)) return
  enCurso.add(id)
  $.clock.after(LIMITE_AGENTE, () => void vencer($, id))
}

const motivo = (r: ModelForkResult): string =>
  r.isAnswered ? '' : r.reason === 'api-error' ? t().errorApi(r.error) : r.reason

// La pregunta ya está contada en pendientes: si el agente parte, la cuenta pasa a él.
async function lanzarAgente($: EngineInterface, encargo: string): Promise<void> {
  const antes = new Set(await mios($))
  const r = await $.agent.spawn({
    prompt: `${t().avisoAgente}\n\n${encargo}`,
    description: t().titulo.toLowerCase(),
    subagentType: 'general-purpose',
  })
  await anotar($, `spawn ${JSON.stringify(r)}`)
  if (r.deny !== undefined) {
    await agregar($, 'claude', t().sinLanzar(r.deny))
    await cambiarPendientes($, -1)
    return
  }
  const id = r.agentId ?? (await mios($)).find(x => !antes.has(x))
  if (id === undefined) {
    await agregar($, 'claude', t().sinIdentificar)
    await cambiarPendientes($, -1)
    return
  }
  seguir($, id)
}

const PEDIDO_AGENTE = /(?:^|\n)[\s>*_`#-]*AGENTE?[\s*_`]*:[\s*_`]*([\s\S]*)$/

async function preguntar($: EngineInterface, texto: string): Promise<void> {
  const previo = historial(await read($, mensajes))
  await agregar($, 'yo', texto)
  await update($, borrador, () => '')
  await cambiarPendientes($, 1)

  const cuerpo = (previo ? `${t().conversacionPrevia}\n${previo}\n\n` : '') + `${t().pregunta} ${texto}`
  try {
    if ((await read($, modo)) === 'suelta') {
      const hoy = new Date().toISOString().slice(0, 10)
      const r = await $.model.complete({
        model: 'sonnet',
        system: `${t().sistema(persona)} ${t().hoy(hoy)}`,
        prompt: cuerpo,
        maxTokens: 2048,
        timeoutMs: 120000,
      })
      await agregar($, 'claude', r.isAnswered ? r.text.trim() : t().sinRespuesta(motivo(r)))
      await cambiarPendientes($, -1)
      return
    }

    // Con contexto: el fork responde si le basta la conversación; si necesita consultar algo,
    // devuelve "AGENTE:" con un encargo autocontenido y lo resuelve un subagente con herramientas.
    // Sin conversación todavía, o si el fork intentó usar una herramienta, va directo al agente.
    const r = await $.model.fork({ prompt: `${t().avisoFork}\n\n${cuerpo}` })
    if (!r.isAnswered && (r.reason === 'nothing-to-fork' || r.reason === 'empty-reply')) {
      return await lanzarAgente($, cuerpo)
    }
    if (!r.isAnswered) {
      await agregar($, 'claude', t().sinRespuesta(motivo(r)))
      await cambiarPendientes($, -1)
      return
    }
    const respuesta = r.text.trim()
    const pedido = PEDIDO_AGENTE.exec(respuesta)?.[1]?.trim()
    if (pedido) return await lanzarAgente($, `${pedido}\n\n${t().preguntaOriginal} ${texto}`)

    await agregar($, 'claude', respuesta)
    await cambiarPendientes($, -1)
  } catch (err) {
    await anotar($, `error ${String(err)}`)
    await agregar($, 'claude', t().error(err instanceof Error ? err.message : String(err)))
    await cambiarPendientes($, -1)
  }
}

// Avanza el porcentaje cada segundo mientras corre la compactación y, al terminar, guarda el
// ritmo real para estimar mejor la próxima. Si ya hay una en seguimiento (el botón llama a
// $.session.compact y el hook de session.compact también la ve), la segunda no duplica.
let siguiendo = false
async function conAvance<T extends { tokensBefore?: number }>($: EngineInterface, correr: () => Promise<T>): Promise<T> {
  if (siguiendo) return correr()
  siguiendo = true
  let vivo = true
  const inicio = await $.clock.now()
  const tokens = (await $.session.usage().catch(() => undefined))?.context.tokens
  const ritmo = Number(await $.store.get('ritmoCompactar').catch(() => undefined)) || RITMO_INICIAL
  const total = esperado(tokens, ritmo)
  const tic = async () => {
    if (!vivo) return
    const ahora = await $.clock.now()
    if (vivo) await update($, avance, () => porcentaje(ahora - inicio, total))
    $.clock.after(1000, () => void tic())
  }
  void tic()
  try {
    const r = await correr()
    const antes = r.tokensBefore ?? tokens
    if (antes !== undefined) await $.store.set('ritmoCompactar', nuevoRitmo(ritmo, (await $.clock.now()) - inicio, antes)).catch(() => undefined)
    return r
  } finally {
    vivo = false
    siguiendo = false
    await update($, avance, () => null)
  }
}

async function hacerCompactacion($: EngineInterface): Promise<void> {
  try {
    const r = await conAvance($, () => $.session.compact())
    if (r.skip !== undefined) $.ui.toast(t().noCompacto(r.skip))
    else {
      const k = (n?: number) => (n === undefined ? '?' : `${Math.round(n / 1000)}k`)
      $.ui.toast(t().compactada(k(r.tokensBefore), k(r.tokensAfter)))
    }
  } catch (err) {
    const texto = err instanceof Error ? err.message : String(err)
    await anotar($, `compactar ${texto}`)
    $.ui.toast(t().noPudoCompactar(texto, /turn/i.test(texto)))
  }
  await update($, compactar, () => 'listo' as const)
}

async function hacerClear($: EngineInterface): Promise<void> {
  try {
    await $.command.run({ command: 'clear', args: '' })
  } catch (err) {
    const texto = err instanceof Error ? err.message : String(err)
    await anotar($, `clear ${texto}`)
    $.ui.toast(t().noPudoClear(texto))
  }
  await update($, borrar, () => 'listo' as const)
}

// Aplica el color: barra del prompt (/color nativo), tinte de la terminal y pestaña de cmux.
// La franja y los mensajes se redibujan solos al cambiar el estado.
async function aplicarColor($: EngineInterface, i: number, conBarra: boolean): Promise<void> {
  const c = i === SIN_COLOR ? undefined : PALETA[i]
  if (conBarra) {
    await $.command.run({ command: 'color', args: c ? c.id : 'default' }).catch((err: unknown) => anotar($, `color ${String(err)}`))
  }
  const titulo = carpeta(await $.session.cwd().catch(() => ''))
  await $.process
    .run(['/bin/sh', '-c', scriptAplicar(c, titulo)], { timeoutMs: 5000 })
    .catch((err: unknown) => anotar($, `tinte ${String(err)}`))
}

async function alternar($: EngineInterface): Promise<boolean> {
  try {
    const actual = (await $.ui.panes()).find(p => p.id === PANE)
    if (actual?.isPlaced && actual.isShown) {
      await $.ui.close({ id: PANE })
      await update($, abierto, () => false)
      return false
    }
    const r = await $.ui.open({ id: PANE, title: t().titulo, focus: true, columns: 48 })
    if (!r.isPlaced) $.ui.toast(t().panelEnEspera(r.reason))
    await update($, abierto, () => true)
    await update($, sinLeer, () => false)
    return true
  } catch (err) {
    $.ui.toast(t().panelError(err instanceof Error ? err.message : String(err)))
    return false
  }
}

type Medida = { modelo: string; contexto: number | null; limite: number | null }

async function medir(
  $: EngineInterface,
  pct?: number,
  limites?: { kind: string; percentUsed: number }[],
) {
  if (pct === undefined && limites === undefined) {
    const u = await $.session.usage()
    pct = u.context.percent
    limites = u.rateLimits
  }
  const base = await $.session.model()
  const elegido = await read($, modeloSesion)
  const modelo = modeloCorto(elegido === null ? base : modeloPedido(base, elegido))
  const l = limites?.find(r => r.kind === 'five_hour')
  const m: Medida = {
    modelo,
    contexto: pct === undefined ? null : Math.round(pct),
    limite: l ? Math.round(l.percentUsed) : null,
  }
  await update($, medida, () => m)
}

export const register: Register = (on, opciones) => {
  opcionIdioma = opciones?.language
  persona = typeof opciones?.persona === 'string' ? opciones.persona.trim() : ''
  fijos = leerFijos(opciones?.folderColors)
  on('session.start', async ($, e, next) => {
    activo = e.isInteractive
    await elegirIdioma($)
    // Si el comando no se puede registrar (otro plugin ya tiene /lateral), el resto sigue.
    await $.command
      .register({ name: 'lateral', description: t().comando, immediate: true })
      .catch(() => undefined)
    if (!activo) return next(e)
    await update($, compactar, () => 'listo' as const)
    await update($, borrar, () => 'listo' as const)
    // Color: la primera vez según la carpeta; en una recarga o al retomar, solo el tinte.
    const previo = await read($, colorSesion)
    if (previo === null) {
      const i = colorPorCarpeta(e.cwd, fijos)
      await update($, colorSesion, () => i)
      $.clock.after(0, () => void aplicarColor($, i, true))
    } else {
      $.clock.after(0, () => void aplicarColor($, previo, false))
    }
    // Effort: el default de settings al abrir; después lo mueven el botón y /effort.
    $.clock.after(0, () => {
      void (async () => {
        const n = nivelDeSettings((await $.settings.read()) as Record<string, unknown>, await $.session.model())
        if (n !== null) await update($, esfuerzo, () => n)
      })().catch((err: unknown) => anotar($, `effort ${String(err)}`))
    })
    $.clock.after(0, () => void medir($).catch((err: unknown) => anotar($, `medida ${String(err)}`)))
    await anotar($, `session.start ${JSON.stringify(e).slice(0, 120)}`)
    // session.start también corre en cada recarga del mod: se rehace lo que vivía en memoria.
    const panes = await $.ui.panes().catch(() => [])
    await update($, abierto, () => panes.some(p => p.id === PANE && p.isPlaced))
    const vivos = (await $.agent.list().catch(() => []))
      .filter(a => a.spawnedBy === 'session-bar' && a.status === 'running')
      .map(a => a.id)
    vivos.forEach(id => seguir($, id))
    await update($, pendientes, () => vivos.length)

    return next(e)
  })

  on('command.run', { command: 'lateral' }, async $ => {
    await alternar($)

    // Sin texto: con Opt+L se usa a cada rato y no tiene que dejar una línea en la conversación.
    return {}
  })

  // Se abre desde el hook de ui.press y no desde onPress: el $ de este hook lleva el
  // origen "lo pidió la persona", y así el panel se ubica a cualquier ancho.
  on('ui.press', { plugin: 'session-bar', element: 'toggle-lateral' }, async ($, e) => {
    await alternar($)

    return { element: e.element }
  })

  // El subagente entrega su informe como un mensaje "peer" a la conversación principal
  // (<agent-message from="id">). Si es de un agente nuestro, va al panel y no entra.
  on('prompt.submit', async ($, e, next) => {
    if (!activo) return next(e)
    const id = /<agent-message from="([^"]+)"/.exec(e.text)?.[1]
    if (id !== undefined) {
      await anotar($, `submit origin=${JSON.stringify(e.origin)} id=${id} enCurso=${[...enCurso].join(',')} turnId=${e.turnId}`)
    }
    if (e.origin.kind === 'task-notification') {
      const conocidos = new Set([...enCurso, ...respondidos, ...(await mios($))])
      const nuestro = [...conocidos].find(x => e.text.includes(x))
      if (nuestro !== undefined) {
        await anotar($, `aviso descartado ${nuestro}`)
        return { drop: t().agenteTerminado }
      }
    }
    if (e.origin.kind !== 'peer' || id === undefined || !(await esMio($, id))) return next(e)
    await anotar($, `descartado ${id}`)

    const cuerpo = e.text.split('The report follows:\n')[1] ?? e.text
    const informe = cuerpo
      .replace(/<\/agent-message>\s*$/, '')
      .split('\n')
      .map(l => l.replace(/^ {2}/, ''))
      .join('\n')
      .trim()
    await responder($, id, informe || t().sinInforme)

    return { drop: t().respuestaEnPanel }
  })

  // Respaldo: si el agente terminó con texto propio. Sin texto, su informe llega después
  // como mensaje "peer" (en la sesión interactiva este evento va primero).
  on('turn.complete', async ($, e, next) => {
    if (!activo) return next(e)
    const id = e.agentId
    if (id !== undefined) await anotar($, `turn.complete agentId=${id} answerLen=${e.answer.length}`)
    if (id !== undefined && (await esMio($, id))) {
      if (e.reason !== 'answer' || e.isAborted) await responder($, id, t().agenteFallo(e.reason))
      else if (e.answer.trim()) await responder($, id, e.answer.trim())
    }

    return next(e)
  })

  // Candado real de solo lectura: el aviso del agente lo pide, esto lo hace cumplir.
  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (!activo || id === undefined || !(enCurso.has(id) || respondidos.has(id) || (await mios($)).includes(id))) return next(e)
    const motivo = motivoBloqueo(e.tool, e as unknown as Record<string, unknown>)
    if (motivo === undefined) return next(e)
    await anotar($, `bloqueado ${id} ${e.tool}: ${motivo}`)
    return { deny: t().soloLectura(motivo) }
  })

  // /effort escrito a mano también mueve el botón, y desde ahí manda el nivel nativo.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const r = await next(e)
    const n = nivelDeArgs(e.args)
    if (n !== null) {
      await update($, esfuerzo, () => n)
      await update($, esfuerzoSesion, () => null)
    }
    return r
  })

  // /model escrito a mano manda: el desplegable vuelve a seguir al de Claude Code.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const r = await next(e)
    if (e.args.trim() !== '') await update($, modeloSesion, () => null)
    $.clock.after(0, () => void medir($).catch(() => undefined))
    return r
  })

  on('ui.press', { plugin: 'session-bar', element: 'modelo' }, async ($, e) => {
    await update($, menuModelo, v => !v)
    return { element: e.element }
  })

  for (const m of MODELOS) {
    on('ui.press', { plugin: 'session-bar', element: `modelo-${m}` }, async ($, e) => {
      await update($, modeloSesion, () => m)
      await update($, menuModelo, () => false)
      await medir($)
      return { element: e.element }
    })
  }

  // Barra de effort: el clic no pasa por /effort (que lo guarda como default de las sesiones
  // nuevas); el nivel queda en esta sesión y se aplica pedido a pedido.
  for (const n of NIVELES) {
    on('ui.press', { plugin: 'session-bar', element: `effort-${n}` }, async ($, e) => {
      await update($, esfuerzo, () => n)
      await update($, esfuerzoSesion, () => n)
      return { element: e.element }
    })
  }

  // El nivel nativo que traía el último pedido de la conversación principal.
  let ultimoNativo: Nivel | undefined
  // Solo los pedidos de la conversación principal: un subagente conserva el effort que traiga.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    // El nivel nativo cambió desde el último pedido (←/→ en el panel de /model, u otra vía):
    // manda ese, y la barra lo sigue.
    if (esNivel(e.effort)) {
      if (ultimoNativo !== undefined && e.effort !== ultimoNativo) {
        void anotar($, `turn.step effort nativo ${ultimoNativo} → ${e.effort}: la barra lo sigue`)
        await update($, esfuerzo, () => e.effort as Nivel)
        await update($, esfuerzoSesion, () => null)
      }
      ultimoNativo = e.effort
    }
    const n = e.effort !== undefined ? await read($, esfuerzoSesion) : null
    if (n !== null && n !== e.effort) void anotar($, `turn.step effort ${String(e.effort)} → ${n}`)
    const m = await read($, modeloSesion)
    const model = m === null || mismoModelo(e.model, m) ? e.model : modeloPedido(e.model, m)
    if (model !== e.model) void anotar($, `turn.step model ${e.model} → ${model}`)
    return yield* next(n === null && model === e.model ? e : { ...e, ...(n === null ? {} : { effort: n }), model })
  })

  on('ui.press', { plugin: 'session-bar', element: 'color' }, async ($, e) => {
    const i = siguiente((await read($, colorSesion)) ?? SIN_COLOR)
    await update($, colorSesion, () => i)
    $.clock.after(0, () => void aplicarColor($, i, true))
    return { element: e.element }
  })

  // /clear deja el estado en blanco sin otro session.start: sin esto la sesión se queda sin color
  // y la barra sin el nombre de la carpeta.
  on('classic.SessionStart', async ($, e, next) => {
    if (activo) await elegirIdioma($)
    if (activo && e.source === 'clear' && (await read($, colorSesion)) === null) {
      const i = colorPorCarpeta(e.cwd, fijos)
      await update($, colorSesion, () => i)
      $.clock.after(0, () => void aplicarColor($, i, true))
    }
    return next(e)
  })

  // Al salir, la terminal y la pestaña vuelven a lo normal. Un /clear no es salir: el
  // proceso sigue (sin otro session.start), así que el tinte se queda.
  on('session.end', async ($, e, next) => {
    if (activo && e.reason !== 'clear') await $.process.run(['/bin/sh', '-c', scriptAplicar(undefined, '')], { timeoutMs: 3000 }).catch(() => undefined)
    return next(e)
  })

  // Tus mensajes con una marca del color de la sesión.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const arbol = await next(e)
    const i = await read($, colorSesion)
    const c = i === null || i === SIN_COLOR ? undefined : PALETA[i]
    if (!activo || !c || e.props.origin.kind !== 'composer') return arbol
    // Fila propia y no la nativa: la nativa trae su propio fondo gris, que tapa el tinte.
    // Fondo teñido más una marca a la izquierda, sin recuadro (Box no admite borde de un solo lado).
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box marginTop={1}>
        <Box flexGrow={1} backgroundColor={c.tinte}>
          <Box flexDirection="column" backgroundColor={c.tinte}>
            {e.props.text.split('\n').map((_, k) => (
              <Text key={k} backgroundColor={c.tinte}>
                <Text color={c.ink} bold>
                  {'▌ '}
                </Text>
                <Text dimColor>{k === 0 ? '❯ ' : '  '}</Text>
              </Text>
            ))}
          </Box>
          <Box flexGrow={1} backgroundColor={c.tinte}>
            <Text color="whiteBright" backgroundColor={c.tinte}>
              {e.props.text}
            </Text>
          </Box>
        </Box>
      </Box>
    )
  })

  on('ui.press', { plugin: 'session-bar', element: 'compactar' }, async ($, e) => {
    const fase = await read($, compactar)
    if (fase === 'compactando') return { element: e.element }
    if (fase === 'listo') {
      await update($, compactar, () => 'confirmar' as const)
      $.clock.after(5000, () => {
        void update($, compactar, f => (f === 'confirmar' ? ('listo' as const) : f))
      })
      return { element: e.element }
    }
    if (trabajando) {
      await update($, compactar, () => 'listo' as const)
      $.ui.toast(t().compactarTrabajando)
      return { element: e.element }
    }
    await update($, compactar, () => 'compactando' as const)
    // Fuera del hook del clic: Claude Code rechaza compactar desde dentro de un hook
    // que retiene la sesión (lo comprobé con command.run), así que va en un temporizador.
    $.clock.after(0, () => void hacerCompactacion($))
    return { element: e.element }
  })

  on('ui.press', { plugin: 'session-bar', element: 'borrar' }, async ($, e) => {
    const fase = await read($, borrar)
    if (fase === 'borrando') return { element: e.element }
    if (fase === 'listo') {
      await update($, borrar, () => 'confirmar' as const)
      $.clock.after(5000, () => {
        void update($, borrar, f => (f === 'confirmar' ? ('listo' as const) : f))
      })
      return { element: e.element }
    }
    if (trabajando) {
      await update($, borrar, () => 'listo' as const)
      $.ui.toast(t().clearTrabajando)
      return { element: e.element }
    }
    await update($, borrar, () => 'borrando' as const)
    // Fuera del hook del clic, como compactar: $.command.run se rechaza dentro de un hook que retiene la sesión.
    $.clock.after(0, () => void hacerClear($))
    return { element: e.element }
  })

  // /compact escrito a mano y la compactación automática también muestran su avance en el botón.
  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute' || e.agentId !== undefined) return next(e)
    return conAvance($, () => next(e))
  })

  // Tras cada turno y cuando un límite se mueve un punto; el modelo se relee por si hubo /model.
  on('session.measure', async ($, e, next) => {
    if (activo) await medir($, e.context.percent, e.rateLimits)
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, abierto, () => false)

    return next(e)
  })

  // Línea bajo el prompt: la pista nativa acortada, la carpeta en el color de la sesión (antes
  // iba en una franja propia sobre el prompt) y los botones del mod en íconos. El modo
  // ("auto mode on") lo dibuja Claude Code antes de este árbol: nada puede ir a su izquierda.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    // Sin nada que decir (solo quedaba el recordatorio de shift+tab), la pista nativa no se dibuja.
    // El · tras el modo lo pone Claude Code igual: la carpeta va pegada a él, como si fuera la pista.
    const hint = pistaCorta(e.props.hint)
    const linea = hint ? await next({ ...e, props: { ...e.props, hint } }) : null
    const { Box, Button, Text } = $.ui.resolve(e)
    const on_ = await read($, abierto)
    const nuevo = !on_ && (await read($, sinLeer))
    const fase = await read($, compactar)
    const pct = await read($, avance)
    const faseBorrar = await read($, borrar)
    trabajando = e.props.isWorking
    const ic = await read($, colorSesion)
    const col = ic === null || ic === SIN_COLOR ? undefined : PALETA[ic]
    const ef = await read($, esfuerzo)
    const med = await read($, medida)
    const menu = await read($, menuModelo)
    const elegido = await read($, modeloSesion)
    const base = elegido === null ? await $.session.model().catch(() => '') : ''
    const etiquetaModelo = med.modelo || modeloCorto(base || (elegido ?? '')) || t().modelo
    const { value: conDialogo } = await $.state.get(citasDialogo)

    return (
      <Box flexDirection="column">
        <Box>
          {linea}
          {col ? (
            <Box marginLeft={linea ? 3 : 0}>
              <Text color={col.ink} bold>
                {carpeta(await $.session.cwd().catch(() => ''))}
              </Text>
            </Box>
          ) : null}
          {etiquetaModelo && (med.contexto !== null || med.limite !== null) ? (
            /* Corchetes tenues: es un dato, no un botón (los botones se encienden al pasar el mouse). */
            <Box marginLeft={2}>
              <Text>
                <Text dimColor>[</Text>
                {med.contexto !== null ? <Text color={colorContexto(med.contexto)}>{`${med.contexto}%`}</Text> : null}
                {med.limite !== null && med.contexto !== null ? <Text dimColor>/</Text> : null}
                {med.limite !== null ? <Text color={colorLimite(med.limite)}>{`${med.limite}%`}</Text> : null}
                <Text dimColor>]</Text>
              </Text>
            </Box>
          ) : null}
          <Box marginLeft={2}>
            <Box marginRight={2}>
              <Text dimColor>│</Text>
            </Box>
            {/* Lo atiende el mod inline-replies (ui.press en quote-selection): cita en el prompt lo que
                marcaste con el mouse. */}
            {conDialogo === undefined ? null : (
              <Box marginRight={1}>
                <Box backgroundColor={TECLA} paddingX={1}><Button key="quote-selection" hover={{ ...ENCENDIDO, scope: "quote-selection" }} label="❝+" plain onPress={() => {}} /></Box>
              </Box>
            )}
            <Box backgroundColor={TECLA} paddingX={1}><Button key="toggle-lateral" hover={{ ...ENCENDIDO, scope: "toggle-lateral" }} label={on_ ? '◨' : nuevo ? '◧•' : '◧'} plain dimColor={!on_ && !nuevo} onPress={() => {}} /></Box>
            <Box marginLeft={1}>
              <Box backgroundColor={TECLA} paddingX={1}><Button
                key="compactar"
                hover={{ ...ENCENDIDO, scope: "compactar" }}
                label={pct !== null ? t().botonCompactar.avance(pct) : fase === 'confirmar' ? t().botonCompactar.confirmar : fase === 'compactando' ? t().botonCompactar.compactando : 'C'}
                plain
                dimColor={fase === 'listo' && pct === null}
                onPress={() => {}}
              /></Box>
            </Box>
            <Box marginLeft={1}>
              <Box backgroundColor={TECLA} paddingX={1}><Button
                key="borrar"
                hover={{ ...ENCENDIDO, scope: "borrar" }}
                label={faseBorrar === 'confirmar' ? t().botonBorrar.confirmar : faseBorrar === 'borrando' ? t().botonBorrar.borrando : '⌫'}
                plain
                dimColor={faseBorrar === 'listo'}
                onPress={() => {}}
              /></Box>
            </Box>
            <Box marginLeft={1}>
              {/* Button no admite color propio: el emoji de la marca ya trae el suyo. */}
              <Box><Button key="color" hover={{ ...ENCENDIDO, scope: "color" }} label={col ? col.marca : '○'} plain dimColor={!col} onPress={() => {}} /></Box>
            </Box>
          </Box>
        </Box>
        {/* Effort en su propia fila, bajo la anterior: todos los niveles a la vista. Button no
            admite color ni algo más tenue que dimColor: el actual va como Text en negrita y color
            (clicarlo no haría nada), los demás quedan como botones apagados. */}
        <Box>
          {etiquetaModelo ? (
            <Box marginRight={2}>
              {/* Button no admite color: el modelo pierde el cian, pero se despliega con un clic. */}
              <Box backgroundColor={TECLA} paddingX={1}><Button key="modelo" hover={{ ...ENCENDIDO, scope: "modelo" }} label={`${etiquetaModelo} ${menu ? '▸' : '▾'}`} plain onPress={() => {}} /></Box>
              {/* Desplegable de modelo, a la derecha del botón: el actual en negrita, los demás apagados. */}
              {menu
                ? MODELOS.map(m => (
                    <Box key={`modelo-${m}`} marginLeft={2}>
                      {(elegido ?? '') === m || (elegido === null && mismoModelo(base, m)) ? (
                        <Text color="cyanBright" bold>
                          {modeloCorto(m)}
                        </Text>
                      ) : (
                        <Button key={`modelo-${m}`} hover={{ ...ENCENDIDO, scope: `modelo-${m}` }} label={modeloCorto(m)} plain dimColor onPress={() => {}} />
                      )}
                    </Box>
                  ))
                : null}
            </Box>
          ) : null}
          {NIVELES.map((n, i) => (
            <Box key={`effort-${n}`} marginLeft={i === 0 ? 0 : 1}>
              {n === ef ? (
                <Text color="whiteBright" bold>
                  {LETRA[n]}
                </Text>
              ) : (
                <Button key={`effort-${n}`} hover={{ ...ENCENDIDO, scope: `effort-${n}` }} label={LETRA[n]} plain dimColor onPress={() => {}} />
              )}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = els
    const Input = 'Input' in els ? els.Input : undefined
    const lista = await read($, mensajes)
    const m = await read($, modo)
    const enEspera = await read($, pendientes)
    const texto = await read($, borrador)

    // Se muestran los mensajes más nuevos que caben, para que la caja de texto quede a la
    // vista aun con el panel bajo (inline) o con respuestas largas. Siempre el último.
    const columnas = Math.max(10, e.props.bodyColumns - 2)
    const presupuesto = Math.max(4, e.props.scroll.bodyRows - 6 - (enEspera > 0 ? 1 : 0))
    const alto = (msg: Mensaje) =>
      msg.texto.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil((l.length + 2) / columnas)), 0) +
      (msg.quien === 'claude' ? 1 : 0)
    const desde = (() => {
      let usados = 0
      let i = lista.length
      while (i > 0 && lista.length - i < VISIBLES) {
        const h = alto(lista[i - 1] as Mensaje)
        if (i < lista.length && usados + h > presupuesto) break
        usados += h
        i -= 1
      }
      return i
    })()

    return (
      <Box flexDirection="column">
        <Box>
          <Button
            key="modo-contexto"
            label={t().conContexto}
            hotkey="1"
            variant={m !== 'suelta' ? 'primary' : 'secondary'}
            onPress={() => update($, modo, () => 'contexto' as Modo)}
          />
          <Text> </Text>
          <Button
            key="modo-suelta"
            label={t().suelta}
            hotkey="2"
            variant={m === 'suelta' ? 'primary' : 'secondary'}
            onPress={() => update($, modo, () => 'suelta' as Modo)}
          />
          <Text> </Text>
          <Button key="limpiar" label={t().limpiar} plain onPress={() => update($, mensajes, () => [] as Mensaje[])} />
        </Box>
        <Text dimColor>
          {m !== 'suelta'
            ? t().pistaContexto
            : t().pistaSuelta}
        </Text>
        <Text> </Text>
        {lista.length === 0 && <Text dimColor>{t().vacio}</Text>}
        {desde > 0 && <Text dimColor>↑ {desde} anteriores (siguen en el contexto del chat)</Text>}
        {lista.slice(desde).map((msg, j) => {
          const i = desde + j
          return msg.quien === 'yo' ? (
            <Text key={`m-${i}`} color="cyan" bold>
              › {msg.texto}
            </Text>
          ) : (
            <Box key={`m-${i}`} marginBottom={1}>
              <Markdown key={`r-${i}`} text={msg.texto} />
            </Box>
          )
        })}
        {enEspera > 0 && (
          <Text dimColor>
            {enCurso.size > 0 ? t().buscando : t().pensando}
            {enEspera > 1 ? ` (${enEspera})` : ''}
          </Text>
        )}
        {Input ? (
        <Input
          key="pregunta"
          placeholder={t().placeholder}
          submitLabel={t().enviar}
          value={texto}
          autoFocus
          onInput={(v: string) => void update($, borrador, () => v)}
          onSubmit={(v: string) => {
            const q = v.trim()
            if (q) void preguntar($, q)
          }}
        />
        ) : (
          <Text dimColor>{t().sinCaja}</Text>
        )}
      </Box>
    )
  })
}
