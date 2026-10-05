import { expect, test } from 'claude-code/testing'

import { cierrePorDuracion, cierreVivo, duracion, leerCierres, resumen } from './lineas'

test('duración y resumen como los escribe el motor', async () => {
  expect(duracion(11095)).toBe('11s')
  expect(duracion(67000)).toBe('1m 7s')
  expect(resumen([{ tool: 'Skill' }, ...Array(11).fill({ tool: 'Bash' })])).toBe('Ran 11 shell commands, called 1 tool')
  expect(resumen([{ tool: 'Read' }])).toBe('Read 1 file')
})

test('la hora de cierre sale del transcript', async () => {
  const c = leerCierres(JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 11095, timestamp: '2026-10-03T23:34:30.244Z', uuid: 'u1' }))
  expect(c.porId.get('u1')).toBe(Date.parse('2026-10-03T23:34:30.244Z'))
  expect(cierrePorDuracion(c, 11095)).toBe(Date.parse('2026-10-03T23:34:30.244Z'))
  expect(cierrePorDuracion(c, 11400)).toBe(undefined)
  expect(cierrePorDuracion(c, 20000)).toBe(undefined)
})

test('dos turnos de duración parecida no comparten hora, y los cierres nuevos no salen del transcript', async () => {
  const l = (d: number, t: string) => JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: d, timestamp: t })
  const c = leerCierres([l(2000, '2026-10-03T23:49:00.000Z'), l(2000, '2026-10-03T23:53:00.000Z')].join('\n'))
  const tomadas = new Set<number>()
  const a = cierrePorDuracion(c, 2000, tomadas)
  tomadas.add(a!)
  expect(a).toBe(Date.parse('2026-10-03T23:49:00.000Z'))
  expect(cierrePorDuracion(c, 2000, tomadas)).toBe(Date.parse('2026-10-03T23:53:00.000Z'))
  expect(cierrePorDuracion(c, 2000, new Set(), Date.parse('2026-10-03T23:50:00.000Z'))).toBe(Date.parse('2026-10-03T23:49:00.000Z'))
  expect(cierrePorDuracion(c, 2000, new Set([Date.parse('2026-10-03T23:49:00.000Z')]), Date.parse('2026-10-03T23:50:00.000Z'))).toBe(undefined)
  expect(cierreVivo([{ durationMs: 1514, ms: 7 }, { durationMs: 1514, ms: 9 }], 1514, new Set([7]))).toBe(9)
  expect(cierreVivo([{ durationMs: 1549, ms: 7 }], 1514, new Set())).toBe(undefined)
})
