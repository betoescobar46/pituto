import { expect, test } from 'claude-code/testing'

import { anchoTexto, dibujarTabla, reemplazarTablas, repartir } from './grilla'

const MD = '| Mod | Qué hace |\n|---|---|\n| Next Steps | Al final de cada turno aparece un recuadro con tres sugerencias de qué hacer después. |'

test('la tabla sale como grilla que cabe en el ancho pedido', async () => {
  for (const ancho of [40, 60, 100]) {
    const out = reemplazarTablas(MD, ancho)
    expect(out.startsWith('```\n┌')).toBe(true)
    for (const l of out.split('\n').filter(l => l.startsWith('│') || l.startsWith('┌'))) {
      expect(anchoTexto(l) <= ancho).toBe(true)
    }
  }
})

test('no toca tablas dentro de un bloque de código ni texto sin tablas', async () => {
  const fence = '```\n' + MD + '\n```'
  expect(reemplazarTablas(fence, 60)).toBe(fence)
  expect(reemplazarTablas('a | b sin separador', 60)).toBe('a | b sin separador')
})

test('el mod reescribe el mensaje del asistente', async ($, on) => {
  on('ui.render', (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text>{(e.props as { text: string }).text}</Text>
  })
  const r = await $.ui.render({ plugin: 'grid-tables', surface: 'terminal', component: 'AssistantMessage', requestId: 'm1', props: { text: MD, isFirstOfReply: true }, viewport: { columns: 70, rows: 40 } } as never)
  expect(JSON.stringify(r)).toContain('┌')
})

test('si no cabe todo, ninguna palabra se corta mientras las palabras quepan', async () => {
  // Naturales 27, 20, 12 en 40 de ancho útil: cada una parte con su palabra más larga y el resto va en proporción.
  expect(repartir([27, 20, 12], 40, [9, 7, 12])).toEqual([16, 12, 12])
  // Sin mínimos, o si ni las palabras caben, manda el reparto parejo de antes.
  expect(repartir([27, 20, 12], 40)).toEqual([14, 14, 12])
  // Si ni las palabras caben, va en proporción a ellas.
  expect(repartir([27, 20, 12], 20, [9, 7, 12])).toEqual([6, 6, 9])
  const filas = [['', 'JSON file', 'SQLite'], ['Human-editable', 'Fair: easy to break with a stray comma', 'No, needs a tool']]
  const out = dibujarTabla(filas, 60)
  expect(out).toContain('│ Human-editable │')
  expect(out).not.toContain('editab ')
})
