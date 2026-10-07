import { expect, mock, test } from 'claude-code/testing'
import type { EngineInterface, On } from 'claude-code'

const PANE = {
  component: 'Pane',
  requestId: 'session-bar',
  props: {
    title: 'Chat lateral',
    isFocused: true,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const SURFACES = ['terminal', 'desktop'] as const

type Agente = { id: string; status: string; spawnedBy?: string }
type Opciones = {
  fork?: () => unknown
  complete?: () => unknown
  spawn?: () => unknown
  agentes?: Agente[]
  panes?: { id: string; isPlaced: boolean; isShown: boolean }[]
  language?: string
}

// Lo que el motor responde por debajo del mod. Registra lo que el mod pidió.
function motor(on: On, o: Opciones = {}) {
  const r = { forks: [] as string[], completes: [] as string[], spawns: [] as string[], opens: 0, closes: 0, toasts: [] as string[], listas: 0 }
  const agentes = o.agentes ?? []
  const panes = o.panes ?? []
  on('model.fork', async (_$, e) => {
    r.forks.push(e.prompt)
    return { value: (o.fork?.() ?? { isAnswered: true, text: 'respuesta fork', usage }) as never }
  })
  on('model.complete', async (_$, e) => {
    r.completes.push(e.prompt)
    return { value: (o.complete?.() ?? { isAnswered: true, text: 'respuesta suelta', usage }) as never }
  })
  on('agent.spawn', async (_$, e) => {
    r.spawns.push(e.prompt)
    const out = (o.spawn?.() ?? { model: 'opus', agentId: `ag-${r.spawns.length}` }) as { agentId?: string }
    if (out.agentId) agentes.push({ id: out.agentId, status: 'running', spawnedBy: 'session-bar' })
    return out as never
  })
  on('agent.list', () => (r.listas += 1, {
    value: agentes.map(a => ({ ...a, description: 'chat lateral', type: 'general-purpose' })),
  }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('ui.open', (_$, e) => {
    r.opens += 1
    const p = panes.find(x => x.id === e.id)
    if (p) Object.assign(p, { isPlaced: true, isShown: true })
    else panes.push({ id: e.id, isPlaced: true, isShown: true })
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    r.closes += 1
    const i = panes.findIndex(x => x.id === e.id)
    if (i >= 0) panes.splice(i, 1)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: panes.map(p => ({ ...p, title: p.id, isFocused: false })) }))
  // El idioma sale de settings.language: las pruebas corren en español salvo que se pida otro.
  on('settings.read', () => ({ value: { language: o.language ?? 'español' } as never }))
  on('ui.toast', (_$, e) => {
    r.toasts.push(String((e as { text?: unknown }).text ?? JSON.stringify(e)))
    return { value: undefined as never }
  })
  return r
}

const informe = (id: string, texto: string) =>
  `<agent-message from="${id}">\n[Subagent hand-back] blah. The report follows:\n${texto
    .split('\n')
    .map(l => `  ${l}`)
    .join('\n')}\n</agent-message>`

const terminar = ($: EngineInterface & { turn: { complete: (x: unknown) => Promise<unknown> } }, id: string, reason = 'answer', answer = '') =>
  $.turn.complete({ answer, durationMs: 5, isAborted: reason === 'aborted', turnId: `t-${id}`, agentId: id, reason })

test('suelta: va a model.complete y la respuesta aparece', async ($, on) => {
  const r = motor(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'session-bar', surface, ...PANE })
    await ui.press({ key: 'modo-suelta' })
    await ui.input({ key: 'pregunta', text: 'half-life of caffeine' })
    expect(await ui.find({ type: 'Markdown', text: /respuesta suelta/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /half-life of caffeine/ })).toBeDefined()
    await ui.press({ key: 'limpiar' })
    await ui.unmount()
  }
  expect(r.completes[0]).toContain('half-life of caffeine')
})

test('con contexto: el fork responde directo cuando le basta la conversación', async ($, on) => {
  const r = motor(on)
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.press({ key: 'modo-contexto' })
  await ui.input({ key: 'pregunta', text: 'en qué vas' })
  expect(r.forks).toHaveLength(1)
  expect(r.spawns).toHaveLength(0)
  expect(await ui.find({ type: 'Markdown', text: /respuesta fork/ })).toBeDefined()
})

test('con contexto: AGENTE lanza un subagente y su informe va al panel, no a la conversación', async ($, on) => {
  const r = motor(on, { fork: () => ({ isAnswered: true, text: 'AGENTE:\nBusca correos de Cintya Canales.', usage }) })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.input({ key: 'pregunta', text: 'me mandó el mail ella?' })
  expect(r.spawns[0]).toContain('SOLO LECTURA')
  expect(r.spawns[0]).toContain('Cintya Canales')
  expect(r.spawns[0]).toContain('me mandó el mail ella?')
  expect(await ui.find({ type: 'Text', text: /buscando/ })).toBeDefined()
  // Orden real de la sesión interactiva: turn.complete vacío primero, luego el informe.
  await terminar($ as never, 'ag-1')
  expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(0)
  const res = await $.prompt.submit({ text: informe('ag-1', 'Sí, ayer a las 18:02.\nAsunto: exámenes'), wait: false, origin: { kind: 'peer' } })
  expect(res.drop).toContain('panel')
  expect(await ui.find({ type: 'Markdown', text: /ayer a las 18:02[\s\S]*Asunto: exámenes/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /buscando|pensando/ })).toBeUndefined()
  const ajeno = await $.prompt.submit({ text: informe('otro', 'hola'), wait: false, origin: { kind: 'peer' } })
  expect(ajeno.drop).toBeUndefined()
})

test('botón de la línea de pista abre y cierra el panel', async ($, on) => {
  const r = motor(on)
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{e.props.hint}</Text>
  })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'session-bar', surface, component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } })
    expect((await ui.find({ key: 'toggle-lateral' }))?.text).toContain('◧')
    await ui.press({ key: 'toggle-lateral' })
    expect((await ui.find({ key: 'toggle-lateral' }))?.text).toContain('◨')
    await ui.press({ key: 'toggle-lateral' })
    expect((await ui.find({ key: 'toggle-lateral' }))?.text).toContain('◧')
    await ui.unmount()
  }
  expect(r.opens).toBe(2)
  expect(r.closes).toBe(2)
})

// ---- Loop 1: estados que se quedaban pegados ----

test('B1: si la llamada al modelo revienta, el panel no queda bloqueado', async ($, on) => {
  let veces = 0
  motor(on, {
    complete: () => {
      veces += 1
      if (veces === 1) throw new Error('modelo bloqueado')
      return { isAnswered: true, text: 'segunda ok', usage }
    },
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.press({ key: 'modo-suelta' })
  await ui.input({ key: 'pregunta', text: 'uno' })
  expect(await ui.find({ type: 'Markdown', text: /error/i })).toBeDefined()
  await ui.input({ key: 'pregunta', text: 'dos' })
  expect(await ui.find({ type: 'Markdown', text: /segunda ok/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /pensando|buscando/ })).toBeUndefined()
})

test('B2: si el subagente falla, el panel lo dice y se libera', async ($, on) => {
  motor(on, { fork: () => ({ isAnswered: true, text: 'AGENTE:\nrevisa algo', usage }) })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.input({ key: 'pregunta', text: 'x' })
  await terminar($ as never, 'ag-1', 'error')
  expect(await ui.find({ type: 'Markdown', text: /falló|error/i })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /buscando|pensando/ })).toBeUndefined()
})

test('B3: si el subagente nunca responde, a los 8 minutos se libera; si después llega, se muestra', async ($, on) => {
  const reloj = mock.clock(on)
  motor(on, { fork: () => ({ isAnswered: true, text: 'AGENTE:\nrevisa algo', usage }) })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.input({ key: 'pregunta', text: 'x' })
  expect(await ui.find({ type: 'Text', text: /buscando/ })).toBeDefined()
  await reloj.advance(8 * 60 * 1000 + 1)
  expect(await ui.find({ type: 'Text', text: /buscando|pensando/ })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: /no ha respondido/ })).toBeDefined()
  const res = await $.prompt.submit({ text: informe('ag-1', 'tarde pero llegó'), wait: false, origin: { kind: 'peer' } })
  expect(res.drop).toContain('panel')
  expect(await ui.find({ type: 'Markdown', text: /tarde pero llegó/ })).toBeDefined()
})

test('B4: si el fork intenta usar herramientas (empty-reply), deriva a un subagente', async ($, on) => {
  const r = motor(on, { fork: () => ({ isAnswered: false, reason: 'empty-reply', usage }) })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.input({ key: 'pregunta', text: 'qué dice el último correo' })
  expect(r.spawns).toHaveLength(1)
  expect(r.spawns[0]).toContain('qué dice el último correo')
})

test('B5: AGENTE con formato markdown igual se reconoce', async ($, on) => {
  const r = motor(on, { fork: () => ({ isAnswered: true, text: '**AGENTE:**\nBusca X en el calendario.', usage }) })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.input({ key: 'pregunta', text: 'q' })
  expect(r.spawns).toHaveLength(1)
  expect(r.spawns[0]).toContain('Busca X en el calendario.')
  expect(await ui.find({ type: 'Markdown', text: /AGENTE/ })).toBeUndefined()
})

test('B6: si el panel está abierto pero detrás de otra pestaña, el botón lo trae al frente', async ($, on) => {
  const r = motor(on, { panes: [{ id: 'session-bar', isPlaced: true, isShown: false }] })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  await ui.press({ key: 'toggle-lateral' })
  expect(r.opens).toBe(1)
  expect(r.closes).toBe(0)
})

test('B7: al recargar, se reconstruyen el estado del botón y los agentes en curso', async ($, on) => {
  motor(on, {
    panes: [{ id: 'session-bar', isPlaced: true, isShown: true }],
    agentes: [{ id: 'ag-viejo', status: 'running', spawnedBy: 'session-bar' }],
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const hint = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  expect((await hint.find({ key: 'toggle-lateral' }))?.text).toContain('◨')
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /buscando/ })).toBeDefined()
  await $.prompt.submit({ text: informe('ag-viejo', 'respuesta tras recarga'), wait: false, origin: { kind: 'peer' } })
  expect(await ui.find({ type: 'Markdown', text: /respuesta tras recarga/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /buscando/ })).toBeUndefined()
})

test('B8: el aviso de tarea terminada de un agente nuestro no entra a la conversación', async ($, on) => {
  motor(on, { fork: () => ({ isAnswered: true, text: 'AGENTE:\nrevisa', usage }) })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.input({ key: 'pregunta', text: 'x' })
  const res = await $.prompt.submit({ text: '<task-notification><task-id>ag-1</task-id><status>completed</status></task-notification>', wait: false, origin: { kind: 'task-notification' } })
  expect(res.drop).toBeDefined()
  const ajeno = await $.prompt.submit({ text: '<task-notification><task-id>otro</task-id></task-notification>', wait: false, origin: { kind: 'task-notification' } })
  expect(ajeno.drop).toBeUndefined()
})

test('se pueden hacer preguntas seguidas sin esperar la anterior', async ($, on) => {
  const r = motor(on, { fork: () => ({ isAnswered: true, text: 'AGENTE:\nrevisa', usage }) })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.input({ key: 'pregunta', text: 'primera' })
  await ui.input({ key: 'pregunta', text: 'segunda' })
  expect(r.spawns).toHaveLength(2)
})

// ---- Loop 3: experiencia ----

test('U1: si la respuesta llega con el panel cerrado, avisa y marca el botón hasta abrirlo', async ($, on) => {
  const r = motor(on, { fork: () => ({ isAnswered: true, text: 'AGENTE:\nrevisa', usage }) })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  await ui.input({ key: 'pregunta', text: 'x' })
  await $.prompt.submit({ text: informe('ag-1', 'listo'), wait: false, origin: { kind: 'peer' } })
  expect(r.toasts.some(t => /llegó una respuesta/.test(t))).toBe(true)
  const hint = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  expect((await hint.find({ key: 'toggle-lateral' }))?.text).toContain('•')
  await hint.press({ key: 'toggle-lateral' })
  await hint.press({ key: 'toggle-lateral' })
  expect((await hint.find({ key: 'toggle-lateral' }))?.text).not.toContain('•')
})

test('U4: con poco alto, muestra lo último que cabe y la caja de texto sigue a la vista', async ($, on) => {
  let n = 0
  motor(on, { complete: () => ({ isAnswered: true, text: `respuesta ${++n} ` + 'larga '.repeat(40), usage }) })
  const bajo = { ...PANE, props: { ...PANE.props, bodyColumns: 30, scroll: { offset: 0, bodyRows: 14 } } }
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...bajo })
  await ui.press({ key: 'modo-suelta' })
  for (const q of ['a', 'b', 'c']) await ui.input({ key: 'pregunta', text: q })
  expect(await ui.find({ type: 'Markdown', text: /respuesta 3/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /respuesta 1/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /anteriores/ })).toBeDefined()
  expect(await ui.find({ key: 'pregunta' })).toBeDefined()
})

test('U5: en una sesión no interactiva (claude -p de un script) el mod no trabaja', async ($, on) => {
  const r = motor(on)
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })
  await terminar($ as never, 'ag-ajeno')
  await $.prompt.submit({ text: informe('ag-ajeno', 'x'), wait: false, origin: { kind: 'peer' } })
  expect(r.listas).toBe(0)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
})

test('compactar: primer clic pide confirmación, el segundo compacta; sin segundo clic se cancela', async ($, on) => {
  const r = motor(on)
  const reloj = mock.clock(on)
  let compactaciones = 0
  on('session.compact', async () => {
    compactaciones += 1
    return { messages: [{ role: 'user' as const, text: 'resumen', toolUses: [] }], tokensBefore: 180000, tokensAfter: 22000 }
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  await ui.press({ key: 'compactar' })
  expect((await ui.find({ key: 'compactar' }))?.text).toContain('¿compactar?')
  await reloj.advance(5001)
  expect((await ui.find({ key: 'compactar' }))?.text).not.toContain('¿compactar?')
  await ui.press({ key: 'compactar' })
  await ui.press({ key: 'compactar' })
  expect((await ui.find({ key: 'compactar' }))?.text).toContain('compactando')
  await reloj.advance(1)
  expect(compactaciones).toBe(1)
  expect(r.toasts.some(t => /180k → 22k/.test(t))).toBe(true)
  expect((await ui.find({ key: 'compactar' }))?.text).toBe('C')
})

test('compactar: mientras corre, el botón muestra el porcentaje estimado', async ($, on) => {
  motor(on)
  const reloj = mock.clock(on)
  let soltar = () => {}
  on('session.compact', async () => {
    await new Promise<void>(ok => { soltar = ok })
    return { messages: [{ role: 'user' as const, text: 'resumen', toolUses: [] }], tokensBefore: 100000, tokensAfter: 20000 }
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  await ui.press({ key: 'compactar' })
  await ui.press({ key: 'compactar' })
  await reloj.advance(1)
  expect((await ui.find({ key: 'compactar' }))?.text).toContain('compactando… 0%')
  await reloj.advance(30_000)
  expect((await ui.find({ key: 'compactar' }))?.text).toMatch(/compactando… [1-9]\d?%/)
  soltar()
  await reloj.advance(1)
  expect((await ui.find({ key: 'compactar' }))?.text).toBe('C')
})

test('compactar: si hay un turno en curso, avisa y no se queda pegado', async ($, on) => {
  const r = motor(on)
  let compactaciones = 0
  on('session.compact', async () => {
    compactaciones += 1
    return { messages: [{ role: 'user' as const, text: 'resumen', toolUses: [] }] }
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: true, hint: 'h' } })
  await ui.press({ key: 'compactar' })
  await ui.press({ key: 'compactar' })
  expect(r.toasts.some(t => /termine el turno/.test(t))).toBe(true)
  expect(compactaciones).toBe(0)
  expect((await ui.find({ key: 'compactar' }))?.text).toBe('C')
})

test('borrar: primer clic pide confirmación, el segundo corre /clear', async ($, on) => {
  motor(on)
  const reloj = mock.clock(on)
  const clears: string[] = []
  on('command.run', { command: 'clear' }, async (_$, e) => {
    clears.push(e.command)
    return { text: '' }
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  await ui.press({ key: 'borrar' })
  expect((await ui.find({ key: 'borrar' }))?.text).toContain('¿/clear?')
  await reloj.advance(5001)
  expect((await ui.find({ key: 'borrar' }))?.text).toBe('⌫')
  await ui.press({ key: 'borrar' })
  await ui.press({ key: 'borrar' })
  await reloj.advance(1)
  expect(clears.length).toBe(1)
  expect((await ui.find({ key: 'borrar' }))?.text).toBe('⌫')
})

test('borrar: si hay un turno en curso, avisa y no corre /clear', async ($, on) => {
  const r = motor(on)
  let clears = 0
  on('command.run', { command: 'clear' }, async () => {
    clears += 1
    return { text: '' }
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: true, hint: 'h' } })
  await ui.press({ key: 'borrar' })
  await ui.press({ key: 'borrar' })
  expect(r.toasts.some(t => /termine el turno/.test(t))).toBe(true)
  expect(clears).toBe(0)
})

test('effort: el nivel elegido queda destacado y los demás siguen clicables', async ($, on) => {
  motor(on)
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  await ui.press({ key: 'effort-high' })
  expect((await ui.find({ key: 'effort-high' }))?.text).toBe('H')
  await ui.press({ key: 'effort-low' })
  expect((await ui.find({ key: 'effort-low' }))?.text).toBe('L')
  expect((await ui.find({ key: 'effort-high' }))?.text).toBe('H')
})

test('modelo: el botón despliega los modelos y el clic corre /model con el id, conservando [1m]', async ($, on) => {
  motor(on)
  const comandos: string[] = []
  let actual = 'claude-opus-5-5[1m]'
  on('session.model', () => ({ value: actual }))
  on('command.run', { command: 'model' }, async (_$, e) => {
    comandos.push(e.args)
    actual = e.args
    return {}
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  await ui.press({ key: 'modelo-claude-sonnet-5-5' }).catch(() => undefined)
  expect(await ui.find({ key: 'modelo-claude-sonnet-5-5' })).toBeFalsy()
  await ui.press({ key: 'modelo' })
  expect((await ui.find({ key: 'modelo-claude-sonnet-5-5' }))?.text).toBe('S5.5')
  // El actual no es botón.
  expect(await ui.find({ type: 'Button', key: 'modelo-claude-opus-5-5' })).toBeFalsy()
  await ui.press({ key: 'modelo-claude-sonnet-5-5' })
  expect(comandos).toEqual(['claude-sonnet-5-5[1m]'])
  expect(await ui.find({ key: 'modelo-claude-haiku-4-5-20251001' })).toBeFalsy()
  expect((await ui.find({ key: 'modelo' }))?.text).toMatch(/^S5\.5 1M/)
})

test('modelo: el mod ya no reescribe el modelo de los pedidos', async ($, on) => {
  motor(on)
  const pedidos: string[] = []
  // eslint-disable-next-line require-yield
  on('turn.step', async function* (_$, e) {
    pedidos.push(`${e.agentId ?? 'main'}:${e.model}`)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
  })
  const paso = async (agentId?: string) => {
    const s = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5[1m]', effort: 'high', messageCount: 1, ...(agentId ? { agentId } : {}) })
    for await (const _ of s) void _
  }
  await paso()
  await paso('ag-1')
  expect(pedidos).toEqual(['main:claude-opus-5-5[1m]', 'ag-1:claude-opus-5-5[1m]'])
})

test('con settings.language en inglés, el panel, la barra y los pedidos al modelo salen en inglés', async ($, on) => {
  const r = motor(on, { language: 'English' })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Ask anything/ })).toBeDefined()
  expect((await ui.find({ key: 'modo-contexto' }))?.text).toContain('With context')
  await ui.input({ key: 'pregunta', text: 'hello' })
  expect(r.forks[0]).toContain('AGENT:')
  expect(r.forks[0]).toContain('Question: hello')
})

test('effort: el clic corre /effort y la barra sigue al nivel nativo de cada pedido', async ($, on) => {
  motor(on)
  const comandos: string[] = []
  const pedidos: string[] = []
  on('command.run', { command: 'effort' }, async (_$, e) => {
    comandos.push(e.args)
    return { text: `Set effort level to ${e.args} (saved as your default for new sessions): …` }
  })
  // eslint-disable-next-line require-yield
  on('turn.step', async function* (_$, e) {
    pedidos.push(String(e.effort))
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const paso = async (effort: 'low' | 'medium' | 'xhigh') => {
    const s = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5[1m]', effort, messageCount: 1 })
    for await (const _ of s) void _
  }
  // El nivel actual va como texto; los demás, como botones.
  const actual = async (ui: { find: (q: { type?: string; key?: string }) => Promise<unknown> }) => {
    for (const n of ['low', 'medium', 'high', 'xhigh', 'max']) if (!(await ui.find({ type: 'Button', key: `effort-${n}` }))) return n
    return null
  }
  await paso('medium')
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  expect(await actual(ui)).toBe('medium')
  await ui.press({ key: 'effort-low' })
  expect(comandos).toEqual(['low'])
  expect(await actual(ui)).toBe('low')
  // El clic no reescribe los pedidos: el nivel lo pone Claude Code, ya cambiado por /effort.
  await paso('low')
  // ←/→ en el panel de /model: el pedido siguiente trae otro nivel y la barra lo sigue.
  await paso('xhigh')
  expect(pedidos).toEqual(['medium', 'low', 'xhigh'])
  expect(await actual(ui)).toBe('xhigh')
})

test('effort: lo que dejan /model y /effort en su salida mueve la barra al instante', async ($, on) => {
  motor(on)
  const salidas: Record<string, string> = {
    model: 'Set model to Opus 5.5 for this session only with high effort',
    effort: 'Kept effort level as medium',
  }
  on('command.run', async (_$, e) => ({ text: salidas[e.command] }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } })
  const como = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
  await $.command.run({ command: 'model', args: '', ...como })
  expect(await ui.find({ type: 'Button', key: 'effort-high' })).toBeFalsy()
  await $.command.run({ command: 'effort', args: 'xhigh', ...como })
  expect(await ui.find({ type: 'Button', key: 'effort-medium' })).toBeFalsy()
  expect(await ui.find({ type: 'Button', key: 'effort-high' })).toBeTruthy()
})
