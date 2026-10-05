import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const RESPUESTA = 'Primer párrafo. ⟦¿Dormiste bien?⟧\n\nSegundo: ⟦¿lo dejo azul o rojo? | *Azul | Rojo⟧\n\nTercero, sin pregunta.'
const MENSAJE = { component: 'AssistantMessage', requestId: 'msg1', props: { text: RESPUESTA, isFirstOfReply: true } } as const
const BARRA = { component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '' } } as const

type Enviado = { text: string; context?: readonly string[] }

// Lo que el motor (y los mods de más abajo) responden por debajo de dialogo.
function motor(on: On) {
  const r = { enviados: [] as Enviado[], box: '', toasts: [] as string[], dibujados: [] as string[], pintado: [] as unknown[] }
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', async () => ({}) as never)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('prompt.submit', async (_$, e) => {
    r.enviados.push({ text: e.text, context: e.context })
    return { text: e.text }
  })
  on('prompt.read', () => ({ value: { text: r.box, cursor: r.box.length } as never }))
  on('prompt.fill', (_$, e) => {
    const x = e as { text: string; decorations?: unknown[] }
    r.box = x.text
    r.pintado = x.decorations ?? []
    return { isFilled: true } as never
  })
  on('ui.toast', (_$, e) => {
    r.toasts.push(String((e as { text?: unknown }).text))
    return { value: undefined as never }
  })
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    r.dibujados.push(e.props.text)
    const { Markdown } = $.ui.resolve(e)
    return <Markdown text={(e.props.isFirstOfReply ? '● ' : '  ') + e.props.text} />
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Button } = $.ui.resolve(e)
    return <Button key="quote-selection" label="+" plain onPress={() => {}} />
  })
  return r
}

const turno = ($: unknown, answer: string) =>
  ($ as never as { turn: { complete: (x: unknown) => Promise<unknown> } }).turn.complete({
    answer, durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer',
  })

const enviar = ($: unknown, text: string) =>
  ($ as never as { prompt: { submit: (x: unknown) => Promise<unknown> } }).prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

test('las preguntas quedan en su lugar, numeradas y con sus alternativas; el clic escribe en el prompt', async ($, on) => {
  const r = motor(on)
  await turno($, RESPUESTA)
  const ui = await $.ui.mount({ plugin: 'inline-replies', surface: 'terminal', ...MENSAJE })
  // Los párrafos con pregunta los dibuja el mod; el tercero pasa al motor, sin marcas, y con su ❝.
  expect(r.dibujados).toEqual(['Tercero, sin pregunta.'])
  const p0 = JSON.stringify(await ui.find({ key: 'pt0-p_0' }))
  expect(p0).toContain('[①  ¿Dormiste bien?](https://inline-replies.invalid/p/0)')
  const p1 = JSON.stringify(await ui.find({ key: 'pt1-p_1-o_1_0-o_1_1' }))
  expect(p1).toContain('[⟨Azul⟩](https://inline-replies.invalid/o/1/0)')
  expect(p1).toContain('_(sin respuesta: Azul)_')
  expect(await ui.find({ key: 'q2' })).toBeDefined()

  // ❝ en un párrafo con pregunta cita el texto limpio, sin la marca.
  await ui.press({ key: 'q0', link: { href: 'https://inline-replies.invalid/q/0' } })
  expect(r.box).toBe('> Primer párrafo. ¿Dormiste bien?\n')
  await ui.press({ key: 'q0', link: { href: 'https://inline-replies.invalid/q/0' } })
  expect(r.box).toBe('')
  // Clic en ①: una línea "①  " al final del prompt, pintada.
  r.box = 'oye'
  await ui.press({ key: 'pt0-p_0', link: { href: 'https://inline-replies.invalid/p/0' } })
  expect(r.box).toBe('oye\n①  ')
  expect(r.pintado).toEqual([{ start: 4, end: 5, color: 'cyan', bold: true }])
  // Otra vez: no duplica, avisa.
  await ui.press({ key: 'pt0-p_0', link: { href: 'https://inline-replies.invalid/p/0' } })
  expect(r.box).toBe('oye\n①  ')
  expect(r.toasts.at(-1)).toContain('ya está en el prompt')
  // Clic en una alternativa: su línea; otra alternativa la reemplaza.
  await ui.press({ key: 'pt1-p_1-o_1_0-o_1_1', link: { href: 'https://inline-replies.invalid/o/1/1' } })
  expect(r.box).toBe('oye\n①  \n②  Rojo')
  await ui.press({ key: 'pt1-p_1-o_1_0-o_1_1', link: { href: 'https://inline-replies.invalid/o/1/0' } })
  expect(r.box).toBe('oye\n①  \n②  Azul')
  // Lo escrito a mano no se pisa: la alternativa va al final.
  r.box = 'oye\n①  \n②  no sé,'
  await ui.press({ key: 'pt1-p_1-o_1_0-o_1_1', link: { href: 'https://inline-replies.invalid/o/1/1' } })
  expect(r.box).toBe('oye\n①  \n②  no sé, Rojo')
  r.box = 'oye\n①  \n②  Azul'

  // Enter: el texto va tal cual y el contexto dice qué es cada número.
  await enviar($, 'oye\n①  sí, bien\n②  Azul')
  const e = r.enviados.at(-1)!
  expect(e.text).toBe('oye\n①  sí, bien\n②  Azul')
  expect(e.context?.[0]).toContain('① ¿Dormiste bien? → sí, bien')
  expect(e.context?.[0]).toContain('② ¿lo dejo azul o rojo? → Azul')
  // Ya respondidas: el mensaje viejo vuelve a ser texto corriente.
  await ui.unmount()
  r.dibujados.length = 0
  const b = await $.ui.mount({ plugin: 'inline-replies', surface: 'terminal', ...MENSAJE })
  expect(r.dibujados).toEqual(['Primer párrafo. ¿Dormiste bien?', 'Segundo: ¿lo dejo azul o rojo?', 'Tercero, sin pregunta.'])
  expect(await b.find({ key: 'pt0-p_0' })).toBeUndefined()
})

test('sin responder, la recomendada se asume y lo demás queda a criterio; nada irreversible', async ($, on) => {
  const r = motor(on)
  await turno($, RESPUESTA)
  await enviar($, 'mira este otro error')
  const e = r.enviados.at(-1)!
  expect(e.text).toBe('mira este otro error')
  expect(e.context?.[0]).toContain('① ¿Dormiste bien? → sin respuesta; si el mensaje no la contesta, decide tú')
  expect(e.context?.[0]).toContain('② ¿lo dejo azul o rojo? → sin respuesta; recomendaste "Azul"')
  expect(e.context?.[0]).toContain('nunca autoriza nada irreversible')
  // Sin preguntas pendientes, el siguiente mensaje pasa limpio.
  await enviar($, 'otra cosa')
  expect(r.enviados.at(-1)).toEqual({ text: 'otra cosa', context: undefined })
})

test('❝ pone la cita en el prompt como "> comienzo…" y el texto completo viaja aparte; otro clic la saca', async ($, on) => {
  const r = motor(on)
  const largo = 'Un párrafo largo que sigue y sigue con muchas palabras para pasarse del ancho de la línea del prompt sin problema.'
  const msg = { component: 'AssistantMessage', requestId: 'm2', props: { text: `Corto.\n\n${largo}`, isFirstOfReply: true } } as const
  const ui = await $.ui.mount({ plugin: 'inline-replies', surface: 'terminal', ...msg })
  await ui.press({ key: 'q1', link: { href: 'https://inline-replies.invalid/q/1' } })
  expect(r.box).toBe('> Un párrafo largo que sigue y sigue con muchas palabras para pasarse del…\n')
  expect(r.pintado).toEqual([{ start: 0, end: r.box.length - 1, dimColor: true, italic: true }])
  expect(JSON.stringify(await ui.find({ key: 'q1' }))).toContain('✓')
  await ui.press({ key: 'q0', link: { href: 'https://inline-replies.invalid/q/0' } })
  expect(r.box).toBe('> Un párrafo largo que sigue y sigue con muchas palabras para pasarse del…\n> Corto.\n')
  await ui.press({ key: 'q1', link: { href: 'https://inline-replies.invalid/q/1' } })
  expect(r.box).toBe('> Corto.\n')
  expect(JSON.stringify(await ui.find({ key: 'q1' }))).toContain('❝')

  await enviar($, '> Corto.\n¿y eso por qué?')
  const e = r.enviados.at(-1)!
  expect(e.text).toBe('> Corto.\n¿y eso por qué?')
  expect(e.context?.[0]).toContain('Texto completo')
  expect(e.context?.[0]).toContain('> Corto.')
  expect(await ui.find({ key: 'q0' })).toBeDefined()
  expect(JSON.stringify(await ui.find({ key: 'q0' }))).toContain('❝')
})

test('el + cita lo marcado con el mouse; sin selección o repetida, solo avisa', async ($, on) => {
  const r = motor(on)
  let seleccion: { text: string; requestId?: string } | undefined = { text: '● ocupa sus receptores sin activarlos    ❝\n', requestId: 'msg1' }
  on('ui.selection', () => ({ value: seleccion as never }))
  const barra = await $.ui.mount({ plugin: 'inline-replies', surface: 'terminal', ...BARRA })
  await barra.press({ key: 'quote-selection', plugin: 'test' })
  expect(r.box).toBe('> ocupa sus receptores sin activarlos\n')
  await barra.press({ key: 'quote-selection', plugin: 'test' })
  expect(r.toasts.at(-1)).toBe('Ese texto ya está en el prompt')
  seleccion = undefined
  await barra.press({ key: 'quote-selection', plugin: 'test' })
  expect(r.toasts.at(-1)).toContain('Primero marca')
  await enviar($, '> ocupa sus receptores sin activarlos\n¿y eso por qué da tolerancia?')
  expect(r.enviados.at(-1)!.context?.[0]).toContain('> ocupa sus receptores sin activarlos')
})

test('/clear vacía lo pendiente', async ($, on) => {
  const r = motor(on)
  await turno($, RESPUESTA)
  await ($ as never as { classic: { SessionStart: (x: unknown) => Promise<unknown> } }).classic.SessionStart({ hook_event_name: 'SessionStart', source: 'clear', session_id: 's', transcript_path: '/tmp/x', cwd: '/tmp' })
  await enviar($, 'hola')
  expect(r.enviados.at(-1)).toEqual({ text: 'hola', context: undefined })
})

test('la misma pregunta en dos párrafos no repite claves', async ($, on) => {
  motor(on)
  const t = 'Uno: ⟦¿Seguro?⟧\n\nDos: ⟦¿Seguro?⟧'
  await turno($, t)
  const ui = await $.ui.mount({ plugin: 'inline-replies', surface: 'terminal', component: 'AssistantMessage', requestId: 'm9', props: { text: t, isFirstOfReply: true } })
  expect(await ui.find({ key: 'pt0-p_0' })).toBeDefined()
  expect(await ui.find({ key: 'pt1-p_0' })).toBeDefined()
})

test('un aviso de error del motor va sin ❝', async ($, on) => {
  motor(on)
  const msg = { component: 'AssistantMessage', requestId: 'err', props: { text: 'API Error: Unable to connect\n\nDouble press esc', isFirstOfReply: true } } as const
  const ui = await $.ui.mount({ plugin: 'inline-replies', surface: 'terminal', ...msg })
  expect(await ui.find({ key: 'q0' })).toBeUndefined()
})

test('los comandos pasan intactos, y en una sesión sin pantalla (claude -p) no cambia nada', async ($, on) => {
  const r = motor(on)
  await turno($, RESPUESTA)
  await enviar($, '/compact')
  expect(r.enviados.at(-1)).toEqual({ text: '/compact', context: undefined })
  await enviar($, '!ls')
  expect(r.enviados.at(-1)).toEqual({ text: '!ls', context: undefined })
  // Siguen pendientes después de un comando.
  await enviar($, '①  sí')
  expect(r.enviados.at(-1)!.context?.[0]).toContain('→ sí')
  await turno($, RESPUESTA)
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false } as never)
  await enviar($, '①  sí')
  expect(r.enviados.at(-1)).toEqual({ text: '①  sí', context: undefined })
})

test('una viñeta que abre con la pregunta se quita: la pregunta ya trae su número', async ($, on) => {
  motor(on)
  const t = 'Dos cosas:\n\n- ⟦¿Nombre? | *remove | rm⟧\n- ⟦¿Confirmar antes? | Sí | No⟧\n- una nota suelta'
  await turno($, t)
  const ui = await $.ui.mount({ plugin: 'inline-replies', surface: 'terminal', component: 'AssistantMessage', requestId: 'v1', props: { text: t, isFirstOfReply: true } })
  const md = await ui.find({ key: 'pt1-p_0-o_0_0-o_0_1' })
  expect(md?.text?.startsWith('[①')).toBe(true)
})
