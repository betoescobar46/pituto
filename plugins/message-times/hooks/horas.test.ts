import { expect, test } from 'claude-code/testing'

import { hhmm, leerHoras } from './horas'

test('lee la hora de los prompts y descarta resultados de herramientas', async () => {
  const jsonl = [
    JSON.stringify({ type: 'user', uuid: 'a', timestamp: '2026-10-02T23:45:10.000Z', message: { content: 'hola' } }),
    JSON.stringify({ type: 'user', uuid: 'b', timestamp: '2026-10-02T23:46:00.000Z', message: { content: [{ type: 'tool_result', content: 'x' }] } }),
    JSON.stringify({ type: 'user', uuid: 'c', timestamp: '2026-10-02T23:47:00.000Z', message: { content: [{ type: 'text', text: 'chao' }] } }),
  ].join('\n')
  const h = leerHoras(jsonl)
  expect(h.porId.has('a')).toBe(true)
  expect(h.porId.has('b')).toBe(false)
  expect(h.porTexto.get('chao')).toBe(Date.parse('2026-10-02T23:47:00.000Z'))
  expect(/^\d\d:\d\d$/.test(hhmm(Date.now()))).toBe(true)
  console.log('offset', new Date().getTimezoneOffset(), hhmm(Date.parse('2026-10-02T23:45:10.000Z')))
})
