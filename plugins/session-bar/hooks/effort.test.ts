import { expect, test } from 'claude-code/testing'

import { nivelDeArgs, nivelDeSalida, nivelDeSettings } from './effort'

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

test('E4: lee el nivel en la salida de /effort y /model', () => {
  expect(nivelDeSalida('Set effort level to xHigh (saved as your default for new sessions): Deeper reasoning')).toBe('xhigh')
  expect(nivelDeSalida('Kept effort level as medium')).toBe('medium')
  expect(nivelDeSalida('Set model to Opus 5.5 for this session only with high effort')).toBe('high')
  expect(nivelDeSalida('Current effort level: low (Quick, straightforward implementation)')).toBe('low')
  expect(nivelDeSalida('Effort level set to auto')).toBe(null)
  expect(nivelDeSalida('Kept model as Opus 5.5')).toBe(null)
  expect(nivelDeSalida('<local-command-stdout>Set model to `Opus 5.5` for this session only with `high` effort</local-command-stdout>')).toBe('high')
  expect(nivelDeSalida('Set effort level to `xhigh` (saved as your default for new sessions)')).toBe('xhigh')
  expect(nivelDeSalida(undefined)).toBe(null)
})
