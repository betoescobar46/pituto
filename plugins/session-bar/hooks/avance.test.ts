import { expect, test } from 'claude-code/testing'

import { RITMO_INICIAL, esperado, nuevoRitmo, porcentaje } from './avance'

test('A1: estima por tokens con un mínimo de 5 s', () => {
  expect(esperado(160_000, RITMO_INICIAL)).toBe(96_000)
  expect(esperado(2000, RITMO_INICIAL)).toBe(5000)
  expect(esperado(undefined, 600)).toBe(60_000)
})

test('A2: no llega a 100 antes de terminar', () => {
  expect(porcentaje(0, 10_000)).toBe(0)
  expect(porcentaje(3700, 10_000)).toBe(37)
  expect(porcentaje(50_000, 10_000)).toBe(99)
})

test('A3: aprende el ritmo de a poco', () => {
  expect(nuevoRitmo(600, 40_000, 100_000)).toBe(500)
  expect(nuevoRitmo(600, 40_000, 0)).toBe(600)
})
