import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PALETA, SIN_COLOR, colorPorCarpeta, leerFijos, scriptAplicar, siguiente } from './color'

const id = (i: number) => (i === SIN_COLOR ? 'sin' : PALETA[i]?.id)

test('C1: color automático por carpeta y ciclo del botón', () => {
  const fijos = leerFijos('clinic=red, Notes = green,billing=blue, rota, x=nada')
  expect(fijos).toEqual([{ patron: 'clinic', id: 'red' }, { patron: 'notes', id: 'green' }, { patron: 'billing', id: 'blue' }])
  expect(leerFijos(undefined)).toEqual([])
  expect(id(colorPorCarpeta('/Users/me/code/clinic', fijos))).toBe('red')
  expect(id(colorPorCarpeta('/Users/me/code/clinic/referencias', fijos))).toBe('red')
  expect(id(colorPorCarpeta('/Users/me/code/notes', fijos))).toBe('green')
  expect(id(colorPorCarpeta('/Users/me/code/billing-app', fijos))).toBe('blue')
  // Las demás carpetas no usan los colores fijos.
  for (const c of ['/tmp/a', '/tmp/b', '/tmp/c', '/tmp/d', '/tmp/e', '/tmp/f']) expect(['red', 'green', 'blue']).not.toContain(id(colorPorCarpeta(c, fijos)))
  const otra = id(colorPorCarpeta('/tmp/otra'))
  expect(['yellow', 'purple', 'orange', 'pink', 'cyan']).toContain(otra)
  expect(id(colorPorCarpeta('/tmp/otra'))).toBe(otra)
  let i = SIN_COLOR
  const vistos: string[] = []
  for (let k = 0; k <= PALETA.length; k++) {
    i = siguiente(i)
    vistos.push(String(id(i)))
  }
  expect(vistos).toEqual([...PALETA.map(c => c.id), 'sin'])
})

test('C1: el script no toca el fondo de la terminal, marca la pestaña y no se rompe con comillas', () => {
  const s = scriptAplicar(PALETA[1], "carpeta d'Ana")
  expect(s).not.toContain(']11')
  expect(s).toContain("'🟢 carpeta d'\\''Ana'")
  const r = scriptAplicar(undefined, '')
  expect(r).not.toContain(']11')
  expect(r).toContain('clear-name')
})

function motor(on: On, cwd = '/Users/me/code/clinic') {
  const r = { colores: [] as string[], scripts: [] as string[] }
  on('command.run', { command: 'color' }, async (_$, e) => {
    r.colores.push(e.args)
    return { text: `Session color set to: ${e.args}` }
  })
  on('process.run', async (_$, e) => {
    r.scripts.push(String((e as { argv?: readonly string[] }).argv?.[2] ?? ''))
    return { value: { exitCode: 0, stdout: '', stderr: '' } as never }
  })
  on('session.cwd', () => ({ value: cwd }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: [] }))
  on('ui.panes', () => ({ value: [] }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>nada</Text>
  })
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  return r
}

const HINT = { component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: 'h' } } as const
const MSG = (kind: 'composer' | 'peer') =>
  ({ component: 'UserMessage', props: { text: 'hola', origin: { kind }, isExpanded: false } }) as const

test('C2: sesión nueva toma el color de la carpeta; una recarga no repite /color, solo la marca', { options: { folderColors: 'clinic=red, notes=green, billing=blue' } }, async ($, on) => {
  const reloj = mock.clock(on)
  const r = motor(on)
  await $.session.start({ cwd: '/Users/me/code/clinic', surface: 'terminal', isInteractive: true })
  await reloj.advance(1)
  expect(r.colores).toEqual(['red'])
  expect(r.scripts.at(-1)).toContain("'🔴 clinic'")
  await $.session.start({ cwd: '/Users/me/code/clinic', surface: 'terminal', isInteractive: true })
  await reloj.advance(1)
  expect(r.colores).toEqual(['red'])
  expect(r.scripts).toHaveLength(2)
})

test('C3: el botón recorre los colores, aplica /color y la marca, y llega a "sin color"', { options: { folderColors: 'clinic=red, notes=green, billing=blue' } }, async ($, on) => {
  const reloj = mock.clock(on)
  const r = motor(on)
  await $.session.start({ cwd: '/Users/me/code/clinic', surface: 'terminal', isInteractive: true })
  await reloj.advance(1)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-bar', surface, ...HINT })
    expect((await ui.find({ key: 'color' }))?.text).toBe('🔴')
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...HINT })
  await ui.press({ key: 'color' })
  await reloj.advance(1)
  expect((await ui.find({ key: 'color' }))?.text).toBe('🟢')
  expect(r.colores.at(-1)).toBe('green')
  for (let k = 0; k < PALETA.length - 1; k++) {
    await ui.press({ key: 'color' })
    await reloj.advance(1)
  }
  expect((await ui.find({ key: 'color' }))?.text).toBe('○')
  expect(r.colores.at(-1)).toBe('default')
  expect(r.scripts.at(-1)).toContain('clear-name')
})

test('C4: carpeta en la línea bajo el prompt y marca en tus mensajes; sin color no toca nada', { options: { folderColors: 'clinic=red, notes=green, billing=blue' } }, async ($, on) => {
  const reloj = mock.clock(on)
  motor(on)
  await $.session.start({ cwd: '/Users/me/code/clinic', surface: 'terminal', isInteractive: true })
  await reloj.advance(1)
  const linea = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...HINT })
  expect(JSON.stringify(await linea.drawn())).toContain('clinic')
  await linea.unmount()
  const mio = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...MSG('composer') })
  expect(JSON.stringify(await mio.drawn())).toContain('▌')
  const ajeno = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...MSG('peer') })
  expect(JSON.stringify(await ajeno.drawn())).not.toContain('▌')
  const hint = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...HINT })
  for (let k = 0; k < PALETA.length; k++) await hint.press({ key: 'color' })
  await reloj.advance(1)
  expect(JSON.stringify(await hint.drawn())).not.toContain('clinic')
  const mio2 = await $.ui.mount({ plugin: 'session-bar', surface: 'terminal', ...MSG('composer') })
  expect(JSON.stringify(await mio2.drawn())).not.toContain('▌')
})
