import { resumen } from './bloques'
import { textos } from './idioma'
import type { Idioma } from './idioma'

export const MAXIMO = 6
export const NUMEROS = ['①', '②', '③', '④', '⑤', '⑥']
// Cuántas letras de una cita caben en su línea "> …" del prompt.
export const ANCHO_PISTA = 72

// Claude marca cada pregunta al usuario en su lugar del texto, entre ⟦ ⟧; las alternativas
// cerradas van dentro tras " | ", y la que recomienda lleva * delante.
const MARCA = /⟦([^⟦⟧]*)⟧/g
const ABIERTA = /⟦([^⟦⟧]*)$/
// Una línea del prompt que responde una pregunta: el número en círculo (lo pone un clic) o, a
// mano o dictado, "1." / "1)" / "1:".
const LINEA_CIRCULO = /^\s*([①②③④⑤⑥])\s*(.*)$/
const LINEA_DIGITO = /^\s*([1-6])[.):]\s+(.*)$/

const normal = (s: string) => s.replace(/\s+/g, ' ').trim()

// Los tramos de código (bloques ``` y `en línea`): una marca ahí es un ejemplo, no una pregunta.
const CODIGO = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g
function enCodigo(texto: string): (i: number) => boolean {
  const tramos = [...texto.matchAll(CODIGO)].map(m => [m.index!, m.index! + m[0].length] as const)
  return i => tramos.some(([a, b]) => i >= a && i < b)
}

// Una pregunta que autoriza algo irreversible o que sale hacia afuera no lleva recomendada: sin
// respuesta nunca cuenta como un sí. Claude ya no debe marcarla; esto lo tapa si igual lo hace.
const IRREVERSIBLE =
  /\b(sub[oaie]|subir|publi|env[ií]|mand[oae]|mandar|borr|elimin|sobrescrib|reemplaz|pag[oaue]|pagar|transfier|transferir|commit|push|merge|rebase|reset|force|delet|drop|desplieg|deploy|instal|desinstal|formate|reinici|apag|compr[oae]|comprar|cancel|cierr|firm[oae]|firmar|acept[oae]|aceptar|confirm)/i

// Las preguntas marcadas de una respuesta, en orden.
export function preguntasDe(respuesta: string): string[] {
  const vistas = new Set<string>()
  const salida: string[] = []
  const codigo = enCodigo(respuesta)
  for (const m of respuesta.matchAll(MARCA)) {
    if (codigo(m.index!)) continue
    const p = normal(m[1] ?? '')
    if (p.length < 2 || vistas.has(p)) continue
    vistas.add(p)
    salida.push(p)
    if (salida.length === MAXIMO) break
  }
  return salida
}

export type Pregunta = { texto: string; opciones: string[]; defecto: number | undefined }

// "¿Lo subo ahora o mañana? | *Ahora | Mañana" → la pregunta, sus alternativas y cuál recomienda.
export function partirLinea(linea: string): Pregunta {
  const [texto = '', ...resto] = linea.split(' | ')
  let defecto: number | undefined
  const opciones: string[] = []
  for (const o of resto) {
    const t = o.trim()
    if (t === '') continue
    if (t.startsWith('*')) {
      const sin = t.slice(1).trim()
      if (sin === '') continue
      if (defecto === undefined) defecto = opciones.length
      opciones.push(sin)
    } else opciones.push(t)
  }
  const t = texto.trim()
  return { texto: t, opciones, defecto: IRREVERSIBLE.test(t) ? undefined : defecto }
}

// Los destinos de los enlaces: nunca se abren (onLinkPress se queda con el clic), solo tienen que ser https.
export const enlacePregunta = (i: number) => `https://inline-replies.invalid/p/${i}`
export const enlaceOpcion = (i: number, j: number) => `https://inline-replies.invalid/o/${i}/${j}`
export const enlaceCita = (i: number) => `https://inline-replies.invalid/q/${i}`

export type Destino = { tipo: 'pregunta'; i: number } | { tipo: 'opcion'; i: number; j: number } | { tipo: 'cita'; i: number }

export function leerEnlace(href: string): Destino | undefined {
  const m = /^https:\/\/inline-replies\.invalid\/([poq])\/(\d+)(?:\/(\d+))?$/.exec(href)
  if (!m) return undefined
  const i = Number(m[2])
  if (m[1] === 'p') return { tipo: 'pregunta', i }
  if (m[1] === 'q') return { tipo: 'cita', i }
  return m[3] === undefined ? undefined : { tipo: 'opcion', i, j: Number(m[3]) }
}

const escaparEnlace = (s: string) => s.replace(/([[\]])/g, '\\$1')

// El texto como se dibuja: cada pregunta en su lugar, sin la marca. Las que esperan respuesta
// llevan su número y son enlace, con sus alternativas como enlaces al lado ("⟨Ahora⟩") y la
// recomendada anotada; las demás (ya respondidas) quedan como texto corriente.
// Con `aparte`, las alternativas no van en el texto: salen en `teclas`, para dibujarlas como
// teclas en su propia línea bajo el párrafo, y la recomendada se marca con ★ en vez de la nota.
export type Teclas = { i: number; opciones: string[]; defecto: number | undefined }
export function dibujarTexto(
  texto: string,
  pendientes: string[],
  idioma: Idioma = 'es',
  aparte = false,
): { texto: string; enlaces: string[]; teclas: Teclas[] } {
  const enlaces: string[] = []
  const teclas: Teclas[] = []
  const t = textos(idioma)
  const una = (contenido: string) => {
    const p = normal(contenido)
    const q = partirLinea(p)
    const i = pendientes.indexOf(p)
    if (i < 0 || i >= MAXIMO) return q.texto
    enlaces.push(enlacePregunta(i))
    // El círculo se dibuja más ancho que su celda y se come el espacio: van dos.
    const partes = [`[${NUMEROS[i]}  ${escaparEnlace(q.texto)}](${enlacePregunta(i)})`]
    if (aparte) {
      if (q.opciones.length > 0) teclas.push({ i, opciones: q.opciones, defecto: q.defecto })
      return partes[0]!
    }
    for (const [j, o] of q.opciones.entries()) {
      enlaces.push(enlaceOpcion(i, j))
      partes.push(`[⟨${escaparEnlace(o)}⟩](${enlaceOpcion(i, j)})`)
    }
    if (q.defecto !== undefined) partes.push(`_(${t.sinRespuesta}: ${q.opciones[q.defecto]})_`)
    return partes.join(' ')
  }
  // Una marca sin cerrar es la respuesta todavía llegando.
  const codigo = enCodigo(texto)
  const salida = texto
    .replace(MARCA, (m: string, c: string, i: number) => (codigo(i) ? m : una(c)))
    .replace(ABIERTA, (m: string, c: string, i: number) => (codigo(i) ? m : partirLinea(c).texto))
  return { texto: salida, enlaces, teclas }
}

// Qué pregunta responde una línea del prompt, si alguna. Los dígitos solo valen si hay tantas
// preguntas: "3. " en un prompt con dos preguntas es texto.
function respondeA(linea: string, n: number, conDigitos: boolean): { i: number; resto: string } | undefined {
  const c = LINEA_CIRCULO.exec(linea)
  if (c) {
    const i = NUMEROS.indexOf(c[1] ?? '')
    return i < n ? { i, resto: c[2] ?? '' } : undefined
  }
  const d = conDigitos ? LINEA_DIGITO.exec(linea) : null
  if (d) {
    const i = Number(d[1]) - 1
    return i < n ? { i, resto: d[2] ?? '' } : undefined
  }
  return undefined
}

// Las respuestas que trae el prompt: cada una arranca en su línea numerada y sigue hasta una
// línea en blanco, otra numerada o una cita. Vacía = sin respuesta.
export function leerRespuestas(texto: string, n: number): (string | undefined)[] {
  const salida: (string | undefined)[] = Array.from({ length: n }, () => undefined)
  // Una lista numerada que pasa de n ("1. … 2. … 3." con dos preguntas) es una lista, no respuestas:
  // ahí solo valen los números en círculo.
  const conDigitos = !texto.split('\n').some(l => {
    const m = /^\s*(\d+)[.):]\s/.exec(l)
    return m !== null && Number(m[1]) > n
  })
  let actual: number | undefined
  for (const linea of texto.split('\n')) {
    const r = respondeA(linea, n, conDigitos)
    if (r) {
      actual = r.i
      salida[r.i] = r.resto.trim()
      continue
    }
    if (actual === undefined) continue
    if (linea.trim() === '' || linea.startsWith('> ')) {
      actual = undefined
      continue
    }
    salida[actual] = `${salida[actual] ?? ''}\n${linea}`.trim()
  }
  return salida.map(r => (r === undefined || r === '' ? undefined : r))
}

// La línea del prompt (índice) que ya responde la pregunta i, si existe.
export function lineaDe(texto: string, i: number): number {
  return texto.split('\n').findIndex(l => (LINEA_CIRCULO.exec(l)?.[1] ?? '') === NUMEROS[i])
}

// El bloque que acompaña al mensaje para Claude: qué pregunta es cada número y qué contestó.
export function contextoPreguntas(preguntas: string[], respuestas: (string | undefined)[], idioma: Idioma = 'es'): string {
  const t = textos(idioma)
  const lineas = preguntas.map((p, i) => {
    const q = partirLinea(p)
    const r = respuestas[i]
    const n = NUMEROS[i]!
    if (r !== undefined) return t.respondida(n, q.texto, r)
    if (q.defecto !== undefined) return t.asumida(n, q.texto, q.opciones[q.defecto]!)
    return t.abierta(n, q.texto)
  })
  return `${t.preguntasCabecera}\n${lineas.join('\n')}\n${t.preguntasPie}`
}

// Lo marcado con el mouse trae lo que la pantalla dibuja alrededor del texto: la viñeta de una
// respuesta (●), la marca de tus mensajes con su hora (▌ ❯ [00:04]), la de una salida de
// herramienta (⎿), el ❝ o ✓ del margen y la sangría de 2 de la conversación (la de un bloque de
// código, que va después, se queda). Se quita, línea por línea.
export function limpiarSeleccion(texto: string): string {
  return texto
    .split('\n')
    .map(l => {
      let x = l.replace(/^ {1,2}(?=\S)|^ {2}/, '').replace(/^[\s\u00a0]*▌[\s\u00a0]*/, '')
      const mensaje = /^❯[\s\u00a0]+/.test(x)
      x = x.replace(/^❯[\s\u00a0]+/, '')
      if (mensaje) x = x.replace(/^\[\d{1,2}:\d{2}\][\s\u00a0]+/, '')
      return x
        .replace(/^[\s\u00a0]*[●⏺⎿][\s\u00a0]+/, '')
        .replace(/[\s\u00a0]*[❝✓][\s\u00a0]*$/, '')
        .replace(/[\s\u00a0]+$/, '')
    })
    .join('\n')
    .trim()
}

// La línea "> …" que representa una cita en el prompt: su comienzo, sin marcas de markdown.
export const pistaDe = (texto: string) => `> ${resumen(texto, ANCHO_PISTA)}`

const citar = (texto: string): string =>
  texto
    .split('\n')
    .map(l => (l.trim() === '' ? '>' : `> ${l}`))
    .join('\n')

// El bloque que acompaña al mensaje para Claude con el texto completo de cada cita, en el orden
// en que aparecen en el mensaje.
export function contextoCitas(citas: { texto: string; pista: string }[], mensaje: string, idioma: Idioma = 'es'): string {
  const orden = [...citas].sort((a, b) => mensaje.indexOf(a.pista) - mensaje.indexOf(b.pista))
  return `${textos(idioma).citasCabecera}\n\n${orden.map(c => citar(c.texto)).join('\n\n')}`
}

export type Decoracion = { start: number; end: number; color?: string; bold?: boolean; dimColor?: boolean; italic?: boolean }

// Cómo se pinta el prompt: el número de cada respuesta en celeste, cada cita atenuada.
export function decoraciones(texto: string): Decoracion[] {
  const salida: Decoracion[] = []
  let desde = 0
  for (const linea of texto.split('\n')) {
    const c = LINEA_CIRCULO.exec(linea)
    if (c) {
      const i = linea.indexOf(c[1]!)
      salida.push({ start: desde + i, end: desde + i + 1, color: 'cyan', bold: true })
    } else if (linea.startsWith('> ')) {
      salida.push({ start: desde, end: desde + linea.length, dimColor: true, italic: true })
    }
    desde += linea.length + 1
  }
  return salida
}

// Agrega una línea al final del prompt, en su propia línea.
export function agregarLinea(texto: string, linea: string): string {
  if (texto === '') return linea
  return texto.endsWith('\n') ? `${texto}${linea}` : `${texto}\n${linea}`
}

// Quita una línea exacta del prompt (la primera que coincida), sin dejar el hueco.
export function quitarLinea(texto: string, linea: string): string {
  const lineas = texto.split('\n')
  const i = lineas.indexOf(linea)
  if (i < 0) return texto
  lineas.splice(i, 1)
  return lineas.join('\n')
}
