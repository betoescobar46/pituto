import { expect, test } from 'claude-code/testing'

import { nivelDeArgs, nivelDeSettings } from './effort'

test('E2: reconoce el nivel de un /effort escrito a mano', () => {
  expect(nivelDeArgs(' High ')).toBe('high')
  expect(nivelDeArgs('auto')).toBe(null)
  expect(nivelDeArgs('ultracode on')).toBe(null)
  expect(nivelDeArgs('')).toBe(null)
})

test('E3: el default por modelo manda sobre el general', () => {
  const s = { effortLevel: 'xhigh', modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } }
  expect(nivelDeSettings(s, 'claude-opus-5-5')).toBe('medium')
  expect(nivelDeSettings(s, 'claude-sonnet-5-5')).toBe('xhigh')
  expect(nivelDeSettings({}, 'claude-opus-5-5')).toBe(null)
})
