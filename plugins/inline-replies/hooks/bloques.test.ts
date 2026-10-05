import { expect, test } from 'claude-code/testing'

import { armarMensaje, partirBloques, resumen } from './bloques'

test('parte en párrafos, ítems de primer nivel, tablas, código y títulos', async () => {
  const md = [
    '## Plan',
    'Primer párrafo,',
    'que sigue en otra línea.',
    '',
    '- uno',
    '  - sub de uno',
    '- dos',
    '1. tres',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    'Después de la tabla.',
    '',
    '```ts',
    'const x = 1',
    '',
    'const y = 2',
    '```',
    'Fin.',
  ].join('\n')
  const b = partirBloques(md)
  expect(b.map(x => x.tipo)).toEqual(['titulo', 'parrafo', 'item', 'item', 'item', 'tabla', 'parrafo', 'codigo', 'parrafo'])
  expect(b[1]!.texto).toBe('Primer párrafo,\nque sigue en otra línea.')
  expect(b[2]!.texto).toBe('- uno\n  - sub de uno')
  expect(b[5]!.texto.split('\n')).toHaveLength(3)
  expect(b[7]!.texto).toBe('```ts\nconst x = 1\n\nconst y = 2\n```')
})

test('texto vacío o de un solo párrafo', async () => {
  expect(partirBloques('')).toEqual([])
  expect(partirBloques('  \n\n')).toEqual([])
  expect(partirBloques('Hola.')).toEqual([{ texto: 'Hola.', tipo: 'parrafo' }])
  // Un cerco sin cerrar no se pierde.
  expect(partirBloques('```\nabierto')).toEqual([{ texto: '```\nabierto', tipo: 'codigo' }])
})

test('el mensaje cita cada trozo con > y deja el comentario debajo', async () => {
  const m = armarMensaje(
    [
      { texto: 'Línea uno\n\nLínea dos', comentario: 'no estoy de acuerdo' },
      { texto: 'Otro párrafo', comentario: '' },
    ],
    'y en general, explícame más',
  )
  expect(m).toBe('> Línea uno\n>\n> Línea dos\nno estoy de acuerdo\n\n> Otro párrafo\n\ny en general, explícame más')
})

test('el resumen de la banda va en una línea, sin markdown y cortado', async () => {
  expect(resumen('**Hola** `x`\nmundo', 40)).toBe('Hola x mundo')
  expect(resumen('a'.repeat(50), 20)).toBe('a'.repeat(19) + '…')
})
