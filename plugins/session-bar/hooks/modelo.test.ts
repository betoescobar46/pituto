import { expect, test } from 'claude-code/testing'

import { esModelo, mismoModelo, modeloPedido } from './modelo'

test('MO1: conserva la ventana de un millón salvo en Haiku', () => {
  expect(modeloPedido('claude-opus-5-5[1m]', 'claude-sonnet-5-5')).toBe('claude-sonnet-5-5[1m]')
  expect(modeloPedido('claude-opus-5-5', 'claude-fable-5-1')).toBe('claude-fable-5-1')
  expect(modeloPedido('claude-opus-5-5[1m]', 'claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001')
})

test('MO2: reconoce modelos y compara sin sufijo', () => {
  expect(esModelo('claude-opus-5-5')).toBe(true)
  expect(esModelo('opus')).toBe(false)
  expect(mismoModelo('claude-opus-5-5[1m]', 'claude-opus-5-5')).toBe(true)
  expect(mismoModelo('claude-opus-5-5', 'claude-sonnet-5-5')).toBe(false)
})
