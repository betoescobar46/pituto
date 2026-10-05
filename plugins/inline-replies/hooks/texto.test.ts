import { expect, test } from 'claude-code/testing'

import {
  agregarLinea,
  contextoCitas,
  contextoPreguntas,
  decoraciones,
  dibujarTexto,
  leerEnlace,
  leerRespuestas,
  limpiarSeleccion,
  lineaDe,
  partirLinea,
  pistaDe,
  preguntasDe,
  quitarLinea,
} from './texto'
import { idiomaDe, textos } from './idioma'

const RESPUESTA = 'Revisé el mod. ⟦¿Dormiste bien?⟧ Y lo otro, ⟦¿lo dejo azul o rojo? | *Azul | Rojo⟧ ¿Esto no es pregunta marcada?'

test('lee las marcas en orden; las alternativas y la recomendada', async () => {
  expect(preguntasDe(RESPUESTA)).toEqual(['¿Dormiste bien?', '¿lo dejo azul o rojo? | *Azul | Rojo'])
  expect(preguntasDe('Sin marcas. ¿Esto en prosa?')).toEqual([])
  expect(partirLinea('¿Ahora o mañana? | *Ahora | Mañana')).toEqual({ texto: '¿Ahora o mañana?', opciones: ['Ahora', 'Mañana'], defecto: 0 })
  expect(partirLinea('¿Ahora o mañana? | Ahora | *Mañana')).toEqual({ texto: '¿Ahora o mañana?', opciones: ['Ahora', 'Mañana'], defecto: 1 })
  expect(partirLinea('¿Dormiste?')).toEqual({ texto: '¿Dormiste?', opciones: [], defecto: undefined })
  // Irreversible: la recomendada no vale aunque Claude la marque.
  expect(partirLinea('¿Lo subo al repo ahora? | *Sí | No').defecto).toBe(undefined)
  expect(partirLinea('¿Le envío el correo? | *Sí | No').defecto).toBe(undefined)
  expect(partirLinea('¿Borro el archivo viejo? | Sí | *No').defecto).toBe(undefined)
  expect(partirLinea('¿Hago el merge a main? | *Sí | No').defecto).toBe(undefined)
  expect(partirLinea('¿Reinicio el servidor? | *Sí | No').defecto).toBe(undefined)
})

test('una marca dentro de código es un ejemplo, no una pregunta', async () => {
  const t = 'Se escribe así: `⟦¿Lo subo? | Sí⟧`, y en bloque:\n\n```\n⟦¿Otra? | a⟧\n```\n\nY esta sí: ⟦¿Dormiste?⟧'
  expect(preguntasDe(t)).toEqual(['¿Dormiste?'])
  const d = dibujarTexto(t, ['¿Dormiste?'])
  expect(d.texto).toContain('`⟦¿Lo subo? | Sí⟧`')
  expect(d.texto).toContain('⟦¿Otra? | a⟧')
  expect(d.texto).toContain('[①  ¿Dormiste?](https://inline-replies.invalid/p/0)')
})

test('dibuja cada pregunta en su lugar: número, alternativas y recomendada como enlaces', async () => {
  const { texto, enlaces } = dibujarTexto(RESPUESTA, preguntasDe(RESPUESTA))
  expect(texto).toBe(
    'Revisé el mod. [①  ¿Dormiste bien?](https://inline-replies.invalid/p/0) Y lo otro, ' +
      '[②  ¿lo dejo azul o rojo?](https://inline-replies.invalid/p/1) [⟨Azul⟩](https://inline-replies.invalid/o/1/0) ' +
      '[⟨Rojo⟩](https://inline-replies.invalid/o/1/1) _(sin respuesta: Azul)_ ¿Esto no es pregunta marcada?',
  )
  expect(enlaces).toEqual(['https://inline-replies.invalid/p/0', 'https://inline-replies.invalid/p/1', 'https://inline-replies.invalid/o/1/0', 'https://inline-replies.invalid/o/1/1'])
  expect(dibujarTexto(RESPUESTA, []).texto).toBe('Revisé el mod. ¿Dormiste bien? Y lo otro, ¿lo dejo azul o rojo? ¿Esto no es pregunta marcada?')
  expect(dibujarTexto('Texto. ⟦¿Dormiste', []).texto).toBe('Texto. ¿Dormiste')
  expect(leerEnlace('https://inline-replies.invalid/p/1')).toEqual({ tipo: 'pregunta', i: 1 })
  expect(leerEnlace('https://inline-replies.invalid/o/1/0')).toEqual({ tipo: 'opcion', i: 1, j: 0 })
  expect(leerEnlace('https://inline-replies.invalid/q/3')).toEqual({ tipo: 'cita', i: 3 })
  expect(leerEnlace('https://otra.cl/1')).toBe(undefined)
})

test('lee las respuestas del prompt: círculo o dígito al inicio de línea, hasta la línea en blanco', async () => {
  const prompt = 'antes de todo\n①  sí\n②  no,\nmejor el rojo\n\ny además revisa el otro archivo\n3. esto es texto'
  expect(leerRespuestas(prompt, 2)).toEqual(['sí', 'no,\nmejor el rojo'])
  expect(leerRespuestas('1. sí\n2) no\n> una cita\nsigue', 3)).toEqual(['sí', 'no', undefined])
  expect(leerRespuestas('②  ', 2)).toEqual([undefined, undefined])
  // Una lista que pasa del número de preguntas es una lista: los dígitos no cuentan, los círculos sí.
  expect(leerRespuestas('arregla esto:\n1. el menú\n2. el botón\n3. el color', 2)).toEqual([undefined, undefined])
  expect(leerRespuestas('①  sí\n1. uno\n2. dos\n3. tres', 2)).toEqual(['sí\n1. uno\n2. dos\n3. tres', undefined])
  expect(lineaDe('hola\n②  no', 1)).toBe(1)
  expect(lineaDe('hola\n②  no', 0)).toBe(-1)
})

test('el contexto dice qué es cada número, y qué se asume de las no respondidas', async () => {
  const c = contextoPreguntas(['¿A?', '¿B? | *sí | no', '¿C?'], ['claro', undefined, undefined])
  expect(c).toContain('① ¿A? → claro')
  expect(c).toContain('② ¿B? → sin respuesta; recomendaste "sí": asúmela')
  expect(c).toContain('③ ¿C? → sin respuesta; si el mensaje no la contesta, decide tú')
  expect(c).toContain('nunca autoriza nada irreversible')
})

test('la pista de una cita, su contexto completo en orden, y las líneas del prompt', async () => {
  const largo = 'Un párrafo **largo** que sigue y sigue con muchas palabras para pasarse del ancho de la línea del prompt sin problema.'
  expect(pistaDe(largo)).toBe('> Un párrafo largo que sigue y sigue con muchas palabras para pasarse del…')
  expect(pistaDe('Corto.')).toBe('> Corto.')
  const citas = [
    { texto: 'Segundo.', pista: '> Segundo.' },
    { texto: 'Primero\ncon dos líneas', pista: '> Primero con dos líneas' },
  ]
  const c = contextoCitas(citas, '> Primero con dos líneas\n> Segundo.\nmi comentario')
  expect(c.indexOf('> Primero\n> con dos líneas')).toBeLessThan(c.indexOf('> Segundo.'))
  expect(agregarLinea('', '①  ')).toBe('①  ')
  expect(agregarLinea('hola', '①  ')).toBe('hola\n①  ')
  expect(agregarLinea('hola\n', '①  ')).toBe('hola\n①  ')
  expect(quitarLinea('a\n> Segundo.\nb', '> Segundo.')).toBe('a\nb')
  expect(quitarLinea('a\nb', '> nada')).toBe('a\nb')
})

test('pinta el número de cada respuesta y atenúa las citas', async () => {
  const d = decoraciones('hola\n①  sí\n> cita')
  expect(d).toEqual([
    { start: 5, end: 6, color: 'cyan', bold: true },
    { start: 11, end: 17, dimColor: true, italic: true },
  ])
})

test('lo marcado con el mouse sale sin viñetas, marcas de mensaje ni ❝', async () => {
  const sel = '▌ ❯ [00:04] Escribe un párrafo corto sobre el café.     \n▌   y otra línea mía\n\n● El café es una de las bebidas   ❝\n  más queridas.\n  ⎿  hola\n❯\u00a0[12:30] el prompt'
  expect(limpiarSeleccion(sel)).toBe('Escribe un párrafo corto sobre el café.\ny otra línea mía\n\nEl café es una de las bebidas\nmás queridas.\nhola\nel prompt')
  // Una hora entre corchetes en medio del texto, o sin ❯ delante, se queda.
  expect(limpiarSeleccion('[00:04] a las [10:00] ✓')).toBe('[00:04] a las [10:00]')
  // La sangría propia de un bloque de código sobrevive.
  expect(limpiarSeleccion('  if (x) {\n      y()\n  }')).toBe('if (x) {\n    y()\n}')
})

test('en inglés cambian la etiqueta, los avisos y los bloques para Claude; el idioma sale de la opción, de settings o de LANG', async () => {
  expect(idiomaDe('auto', 'español', 'en_US.UTF-8')).toBe('es')
  expect(idiomaDe('auto', 'Spanish', undefined)).toBe('es')
  expect(idiomaDe('auto', 'English', 'es_CL.UTF-8')).toBe('en')
  expect(idiomaDe('auto', undefined, 'es_CL.UTF-8')).toBe('es')
  expect(idiomaDe('auto', undefined, 'en_US.UTF-8')).toBe('en')
  expect(idiomaDe('auto', undefined, undefined)).toBe('en')
  expect(idiomaDe('en', 'español', 'es_CL.UTF-8')).toBe('en')
  expect(idiomaDe('es', 'English', 'en_US.UTF-8')).toBe('es')
  expect(dibujarTexto('A ⟦Blue or red? | *Blue | Red⟧', ['Blue or red? | *Blue | Red'], 'en').texto).toContain('_(if unanswered: Blue)_')
  const c = contextoPreguntas(['A?', 'B? | *yes | no', 'C?'], ['sure', undefined, undefined], 'en')
  expect(c).toContain('① A? → sure')
  expect(c).toContain('② B? → unanswered; you recommended "yes"')
  expect(c).toContain('never authorizes anything irreversible')
  expect(contextoCitas([{ texto: 'x', pista: '> x' }], '> x', 'en')).toContain('Quotes: the user marked')
  expect(textos('en').formato).toContain('⟦ ⟧')
})
