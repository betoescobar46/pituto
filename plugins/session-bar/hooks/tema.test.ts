import { expect, test } from 'claude-code/testing'

import { nombreTema, temaDeHex, valorGhostty } from './tema'

test('T1: fondo claro u oscuro por luminancia', () => {
  expect(temaDeHex('#ffffff')).toBe('claro')
  expect(temaDeHex('#282c34')).toBe('oscuro')
  expect(temaDeHex('fdf6e3')).toBe('claro')
  expect(temaDeHex('rojo')).toBe(null)
})

test('T2: config de Ghostty, la última línea manda', () => {
  const texto = 'theme = Dracula\nfont-size = 14\n# cmux themes start\ntheme = light:Modus Operandi,dark:Modus Vivendi\n'
  expect(valorGhostty(texto, 'theme')).toBe('light:Modus Operandi,dark:Modus Vivendi')
  expect(valorGhostty(texto, 'background')).toBe(null)
  expect(valorGhostty('font-family = "JetBrains Mono"', 'font-family')).toBe('JetBrains Mono')
})

test('T3: el par light/dark según la apariencia', () => {
  expect(nombreTema('light:Modus Operandi,dark:Modus Vivendi', false)).toBe('Modus Operandi')
  expect(nombreTema('light:Modus Operandi,dark:Modus Vivendi', true)).toBe('Modus Vivendi')
  expect(nombreTema('GitHub Light Default', true)).toBe('GitHub Light Default')
})
