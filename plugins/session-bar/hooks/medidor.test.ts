import { expect, test } from 'claude-code/testing'

import { colorContexto, colorLimite, modeloCorto } from './medidor'

test('M1: abrevia el modelo como la status line', () => {
  expect(modeloCorto('claude-opus-5-5')).toBe('O5.5')
  expect(modeloCorto('claude-haiku-4-5-20251001')).toBe('H4.5')
  expect(modeloCorto('claude-sonnet-5-5[1m]')).toBe('S5.5 1M')
  expect(modeloCorto('claude-fable-5-1')).toBe('F5.1')
  expect(modeloCorto('otro-modelo')).toBe('otro-modelo')
})

test('M2: colores por tramo', () => {
  expect(colorContexto(10)).toBe('greenBright')
  expect(colorContexto(80)).toBe('#ff8c3a')
  expect(colorLimite(50)).toBe('yellowBright')
  expect(colorLimite(95)).toBe('redBright')
})
