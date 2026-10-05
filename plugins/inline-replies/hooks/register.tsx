import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cita } from '../types'
import { partirBloques } from './bloques'
import { idiomaDe, textos } from './idioma'
import type { Idioma } from './idioma'
import {
  NUMEROS,
  agregarLinea,
  contextoCitas,
  contextoPreguntas,
  decoraciones,
  dibujarTexto,
  leerEnlace,
  leerRespuestas,
  limpiarSeleccion,
  lineaDe,
  partirLinea,
  pistaDe,
  preguntasDe,
  quitarLinea,
} from './texto'

const preguntas = atom({ plugin: 'inline-replies', key: 'preguntas' } as const, [] as string[])
const citas = atom({ plugin: 'inline-replies', key: 'citas' } as const, [] as Cita[])

// Idioma de etiquetas, avisos y bloques para Claude: la opción `language` del mod o, en auto,
// el idioma en que el usuario le pidió a Claude que responda (settings.language), o el del sistema.
let idioma: Idioma = 'es'
const t = () => textos(idioma)
// La opción `language` del mod, tal como llega a register.
let opcionIdioma: unknown

async function elegirIdioma($: EngineInterface) {
  const ajustes = (await $.settings.read().catch(() => ({}))) as Record<string, unknown>
  idioma = idiomaDe(opcionIdioma, ajustes.language, await $.env.get('LANG').catch(() => undefined))
}

// Deja el prompt con este texto, pintado: el número de cada respuesta en celeste, las citas atenuadas.
async function escribir($: EngineInterface, texto: string) {
  await $.prompt.fill({ text: texto, mode: 'replace', decorations: decoraciones(texto) })
}

// Clic en una pregunta del texto: el prompt gana una línea "①  " para escribir la respuesta.
async function responder($: EngineInterface, i: number) {
  const { text } = await $.prompt.read()
  if (lineaDe(text, i) >= 0) {
    $.ui.toast(t().lineaYaEsta(NUMEROS[i]!))
    return
  }
  await escribir($, agregarLinea(text, `${NUMEROS[i]}  `))
}

// Clic en una alternativa: la línea de esa pregunta queda con ella. Si la línea ya tenía otra
// alternativa (o nada), la reemplaza; si tenía algo escrito a mano, la agrega al final.
async function elegir($: EngineInterface, i: number, j: number) {
  const lista = await read($, preguntas)
  const q = partirLinea(lista[i] ?? '')
  const opcion = q.opciones[j]
  if (opcion === undefined) return
  const { text } = await $.prompt.read()
  const k = lineaDe(text, i)
  if (k < 0) return escribir($, agregarLinea(text, `${NUMEROS[i]}  ${opcion}`))
  const lineas = text.split('\n')
  const previa = lineas[k]!.replace(/^\s*[①②③④⑤⑥]\s*/, '').trim()
  const escrita = previa !== '' && !q.opciones.includes(previa)
  lineas[k] = escrita ? `${lineas[k]!.trimEnd()} ${opcion}` : `${NUMEROS[i]}  ${opcion}`
  await escribir($, lineas.join('\n'))
}

// Clic en ❝: la cita entra al prompt como una línea "> comienzo…" (el texto completo viaja
// aparte al enviar); otro clic la saca.
async function alternarCita($: EngineInterface, id: string, texto: string) {
  const lista = await read($, citas)
  const { text } = await $.prompt.read()
  const previa = lista.find(c => c.id === id)
  if (previa) {
    await update($, citas, l => l.filter(c => c.id !== id))
    await escribir($, quitarLinea(text, previa.pista))
    return
  }
  const pista = pistaDe(texto)
  await update($, citas, l => [...l, { id, texto, pista }])
  // El cursor queda en la línea de abajo, listo para el comentario.
  await escribir($, `${agregarLinea(text, pista)}\n`)
}

// Cita lo último que marcó con el mouse (botón + de la barra, lo dibuja session-bar). El clic en
// el botón borra el resaltado, pero $.ui.selection() sigue devolviendo lo marcado.
async function citarSeleccion($: EngineInterface) {
  const sel = await $.ui.selection().catch(() => undefined)
  const texto = limpiarSeleccion(sel?.text ?? '')
  if (texto === '') {
    $.ui.toast(t().marcaPrimero)
    return
  }
  if ((await read($, citas)).some(c => c.texto === texto)) {
    $.ui.toast(t().textoYaEsta)
    return
  }
  await alternarCita($, `sel:${Date.now()}`, texto)
}

// Clic en un enlace del texto: la pregunta o una de sus alternativas.
async function clic($: EngineInterface, href: string) {
  const d = leerEnlace(href)
  if (d?.tipo === 'pregunta') await responder($, d.i)
  else if (d?.tipo === 'opcion') await elegir($, d.i, d.j)
}

// session-bar dibuja el botón + solo si ve este estado escrito; session.start no corre cuando el
// mod entra con /reload-plugins, y /resume y /clear lo dejan en blanco.
async function asegurar($: EngineInterface) {
  if ((await $.state.get({ plugin: 'inline-replies', key: 'citas' } as const)).version > 0) return
  await update($, citas, () => [])
}

// En una sesión sin pantalla (claude -p en scripts) no hay prompt que llenar: el mod no hace
// nada, ni cambia las instrucciones de Claude.
let conPantalla = true

export const register: Register = (on, opciones) => {
  opcionIdioma = opciones?.language

  on('session.start', async ($, e, next) => {
    conPantalla = e.isInteractive
    await elegirIdioma($)
    if (conPantalla) await asegurar($)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (!conPantalla) return next(e)
    await elegirIdioma($)
    await asegurar($)
    // Tras /clear o /resume, las preguntas y citas de antes ya no corresponden a lo que se ve.
    if (e.source === 'clear' || e.source === 'resume') {
      await update($, preguntas, () => [])
      await update($, citas, () => [])
    }
    return next(e)
  })

  on('ui.press', { element: 'quote-selection' }, async ($, e) => {
    await citarSeleccion($)
    return { element: e.element }
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!conPantalla) return r
    await asegurar($)
    return { ...r, sections: [...r.sections, { id: 'inline-replies:format', text: t().formato, scope: 'session' as const }] }
  })

  // Cada tecla repinta el prompt y, si borró una cita a mano, su ❝ vuelve a quedar libre.
  on('prompt.edit', async ($, e, next) => {
    // Tras pegar una imagen, el editor antepone un espacio a la siguiente tecla; si el prompt lo
    // reescribimos nosotros, ese espacio cae al inicio de la línea del comentario: se quita.
    const tecla = e.key?.key
    const inicioDeLinea = e.start === 0 || e.text[e.start - 1] === '\n'
    if (conPantalla && tecla && tecla.length === 1 && tecla !== ' ' && e.inputText === ` ${tecla}` && inicioDeLinea) {
      e = { ...e, inputText: tecla }
    }
    const r = await next(e)
    if (!conPantalla) return r
    const lista = await read($, citas)
    if (lista.some(c => !r.text.includes(c.pista))) await update($, citas, l => l.filter(c => r.text.includes(c.pista)))
    return { ...r, decorations: [...(r.decorations ?? []), ...decoraciones(r.text)] }
  })

  // Enter: el mensaje va tal cual se escribió; aparte viaja, para Claude, qué pregunta es cada
  // número (y qué se asume de las no respondidas) y el texto completo de cada cita.
  on('prompt.submit', async ($, e, next) => {
    // Los comandos (/algo) y el modo bash (!algo) no van al modelo: pasan intactos y lo pendiente sigue.
    const inicio = e.text.trimStart()[0]
    if (!conPantalla || e.origin.kind !== 'composer' || inicio === '/' || inicio === '!') return next(e)
    const pend = await read($, preguntas)
    const marcadas = await read($, citas)
    if (pend.length === 0 && marcadas.length === 0) return next(e)
    const contexto = [...(e.context ?? [])]
    if (pend.length > 0) {
      contexto.push(contextoPreguntas(pend, leerRespuestas(e.text, pend.length), idioma))
      await update($, preguntas, () => [])
    }
    if (marcadas.length > 0) {
      const usadas = marcadas.filter(c => e.text.includes(c.pista))
      if (usadas.length > 0) contexto.push(contextoCitas(usadas, e.text, idioma))
      await update($, citas, () => [])
    }
    return next({ ...e, context: contexto })
  })

  on('turn.complete', async ($, e, next) => {
    if (!conPantalla) return next(e)
    // Una sesión abierta antes de instalar el mod no pasa por session.start: aquí se escribe el
    // estado y aparece el botón ❝+.
    await asegurar($)
    if (e.agentId === undefined && e.reason === 'answer') {
      await update($, preguntas, () => preguntasDe(e.answer))
    }
    return next(e)
  })

  // Cada párrafo de la respuesta se dibuja por separado a través del resto de la cadena (el
  // motor, y grid-tables si es una tabla) y recibe su ❝ a la derecha. Un párrafo con preguntas
  // pendientes se dibuja acá: cada pregunta con su número y sus alternativas como enlaces (un
  // Button no recibe clics en la conversación; un enlace de Markdown con onLinkPress sí, y no
  // abre nada).
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const pend = await read($, preguntas)
    if (e.surface === 'mobile') {
      const { texto } = dibujarTexto(e.props.text, [])
      return texto === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text: texto } })
    }
    // Un aviso de error del motor ("API Error: …") no es texto de Claude: va sin ❝.
    if (e.props.text.startsWith('API Error')) return next(e)
    const bloques = partirBloques(e.props.text)
    if (bloques.length === 0) return next(e)
    const lista = await read($, citas)
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const filas = []
    for (const [i, b] of bloques.entries()) {
      const id = `${e.requestId}:${i}`
      const citado = lista.some(c => c.id === id)
      const primero = e.props.isFirstOfReply && i === 0
      const { texto, enlaces } = dibujarTexto(b.texto, pend, idioma)
      // Lo que se cita es el párrafo como se lee: sin las marcas ⟦ ⟧ ni las alternativas.
      const limpio = enlaces.length > 0 ? dibujarTexto(b.texto, []).texto : texto
      let dibujo
      if (enlaces.length > 0) {
        // La clave lleva las preguntas del párrafo para no repetirse entre párrafos.
        const clave = `pt${i}-${enlaces.map(l => l.slice('https://inline-replies.invalid/'.length).replace(/\//g, '_')).join('-')}`
        // Una viñeta que abre con la pregunta sobra: la pregunta ya trae su número.
        const sinVineta = b.tipo === 'item' ? texto.replace(/^(\s*)(?:[-*+]|\d{1,2}[.)])\s+(?=\[[①②③④⑤⑥])/, '$1') : texto
        dibujo = (
          <Box flexDirection="row">
            <Box width={2} flexShrink={0}>
              <Text>{primero ? '●' : ' '}</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Markdown key={clave} text={sinVineta} pressableLinks={enlaces} onLinkPress={l => void clic($, l.href)} />
            </Box>
          </Box>
        )
      } else {
        dibujo = await next({ ...e, props: { ...e.props, text: texto, isFirstOfReply: primero } })
      }
      // Lo que dibuja el motor llega opaco ({ type: 'engine' }), con una línea en blanco arriba
      // y, si no abre la respuesta, sin la sangría de 2 que lleva el primer párrafo. Lo que dibuja
      // otro mod (grid-tables) llega como árbol, sin margen y con su propia sangría; el párrafo
      // con preguntas de este mod también, y la línea en blanco que lo separa va en la fila entera,
      // para que el ❝ quede a la altura del texto.
      const delMotor = (dibujo as { type?: unknown } | null)?.type === 'engine'
      const pegado = i > 0 && b.tipo === 'item' && bloques[i - 1]!.tipo === 'item'
      const margen = delMotor ? (pegado ? -1 : 0) : i === 0 ? (enlaces.length > 0 ? 1 : 0) : pegado ? 0 : 1
      filas.push(
        <Box key={`b${i}`} flexDirection="row" marginTop={margen}>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} paddingLeft={delMotor && e.props.isFirstOfReply && i > 0 ? 2 : 0}>
            {dibujo}
          </Box>
          <Box width={2} flexShrink={0} marginLeft={1} marginTop={delMotor ? 1 : 0}>
            <Markdown
              key={`q${i}`}
              text={`[${citado ? '✓' : '❝'}](https://inline-replies.invalid/q/${i})`}
              dimColor={!citado}
              pressableLinks={[`https://inline-replies.invalid/q/${i}`]}
              onLinkPress={() => void alternarCita($, id, limpio)}
            />
          </Box>
        </Box>,
      )
    }
    return <Box flexDirection="column">{filas}</Box>
  })
}
