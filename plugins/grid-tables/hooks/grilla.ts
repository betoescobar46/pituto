// Convierte las tablas markdown de un texto en una grilla dibujada con
// caracteres de caja, dentro de un bloque de código, ajustada a `ancho`
// columnas. El motor ya no ve una tabla y no la pasa al formato vertical.

const ANCHO_MIN_COL = 6
// Tope para la palabra más larga que una columna puede exigir entera.
const PALABRA_MAX = 24

// Celdas que ocupa un carácter en el terminal: emoji y CJK valen 2, las
// marcas combinantes 0.
function anchoChar(c: string): number {
  const cp = c.codePointAt(0) ?? 0
  if (/\p{Mn}/u.test(c) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0
  if (/\p{Extended_Pictographic}/u.test(c) && cp > 0xff) return 2
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60)) return 2
  return 1
}

export function anchoTexto(s: string): number {
  let n = 0
  for (const c of s) n += anchoChar(c)
  return n
}

function rellenar(s: string, ancho: number): string {
  return s + ' '.repeat(Math.max(0, ancho - anchoTexto(s)))
}

// Quita el marcado en línea que el bloque de código mostraría crudo.
function limpiarCelda(s: string): string {
  return s
    .trim()
    .replace(/\\\|/g, '|')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
}

function partirFila(linea: string): string[] {
  let s = linea.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  return s.split(/(?<!\\)\|/).map(limpiarCelda)
}

const esSeparador = (l: string) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(l)
const esFila = (l: string) => l.includes('|') && l.trim() !== ''

// Corta un texto en líneas de a lo sumo `ancho` celdas, por palabras; una
// palabra más larga que la columna se parte.
export function envolver(texto: string, ancho: number): string[] {
  const lineas: string[] = []
  let actual = ''
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    let p = palabra
    while (anchoTexto(p) > ancho) {
      if (actual) { lineas.push(actual); actual = '' }
      let corte = ''
      for (const c of p) {
        if (anchoTexto(corte + c) > ancho) break
        corte += c
      }
      lineas.push(corte)
      p = p.slice(corte.length)
    }
    if (!p) continue
    const junto = actual ? `${actual} ${p}` : p
    if (anchoTexto(junto) <= ancho) actual = junto
    else { lineas.push(actual); actual = p }
  }
  if (actual || lineas.length === 0) lineas.push(actual)
  return lineas
}

// Reparte el ancho útil entre columnas: cada una recibe lo que necesita si
// cabe. Si no, se intenta que ninguna palabra se corte: cada columna parte con
// su palabra más larga y lo que sobra se reparte en proporción a lo que le
// falta. Si ni las palabras caben, el ancho se reparte en proporción a esas
// palabras (se cortan las menos posibles). Sin mínimos, las columnas angostas
// (que caben en su parte pareja) quedan enteras y las anchas se reparten lo que
// sobra en partes iguales.
export function repartir(naturales: number[], util: number, minimos?: number[]): number[] {
  const total = naturales.reduce((a, b) => a + b, 0)
  if (total <= util) return naturales
  const suma = (l: number[]) => l.reduce((a, b) => a + b, 0)
  // Reparte `sobra` entre las columnas según `pesos`, partiendo de `base`, sin pasar de `tope`.
  const proporcional = (base: number[], pesos: number[], sobra: number, tope: number[]): number[] => {
    const peso = suma(pesos)
    const exactos = pesos.map(p => (peso ? (sobra * p) / peso : 0))
    const anchos = exactos.map((x, i) => base[i]! + Math.floor(x))
    // Las fracciones que se perdieron al redondear, de mayor a menor.
    const orden = exactos.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
    let resto = base.length ? sobra - suma(exactos.map(Math.floor)) : 0
    for (const [, i] of orden) {
      if (resto <= 0) break
      if (anchos[i]! < tope[i]!) { anchos[i]!++; resto-- }
    }
    return anchos
  }
  if (minimos && suma(minimos) <= util) {
    return proporcional(minimos, naturales.map((n, i) => Math.max(0, n - minimos[i]!)), util - suma(minimos), naturales)
  }
  if (minimos) {
    return proporcional(minimos.map(() => 0), minimos, util, naturales).map(a => Math.max(ANCHO_MIN_COL, a))
  }
  const anchos = naturales.map(() => 0)
  let pendientes = naturales.map((_, i) => i)
  let disponible = util
  for (;;) {
    const parte = Math.floor(disponible / pendientes.length)
    const caben = pendientes.filter(i => naturales[i]! <= parte)
    if (caben.length === 0) break
    for (const i of caben) { anchos[i] = naturales[i]!; disponible -= naturales[i]! }
    pendientes = pendientes.filter(i => naturales[i]! > parte)
    if (pendientes.length === 0) return anchos
  }
  const parte = Math.floor(disponible / pendientes.length)
  pendientes.forEach((i, k) => {
    anchos[i] = Math.max(ANCHO_MIN_COL, parte + (k < disponible - parte * pendientes.length ? 1 : 0))
  })
  return anchos
}

// Un trozo de línea de la grilla: borde, texto de cabecera o de celda. El
// mod pinta cada tipo con su color.
export type Trozo = { t: string; tipo: 'borde' | 'cabecera' | 'celda' }
export type Linea = Trozo[]

export function grillaLineas(filas: string[][], ancho: number): Linea[] {
  const ncol = Math.max(...filas.map(f => f.length))
  const celdas = filas.map(f => Array.from({ length: ncol }, (_, i) => f[i] ?? ''))
  const naturales = Array.from({ length: ncol }, (_, i) => Math.max(1, ...celdas.map(f => anchoTexto(f[i] ?? ''))))
  // La palabra más larga de cada columna, con tope: una URL larga no se queda con todo.
  const minimos = Array.from({ length: ncol }, (_, i) =>
    Math.min(PALABRA_MAX, Math.max(1, ...celdas.flatMap(f => (f[i] ?? '').split(/\s+/).map(anchoTexto)))),
  )
  // Cada columna lleva un espacio a cada lado y un borde; más el borde final.
  const util = Math.max(ncol, ancho - (3 * ncol + 1))
  const anchos = repartir(naturales, util, minimos)
  const envueltas = celdas.map(f => f.map((c, i) => envolver(c, anchos[i]!)))
  const multilinea = envueltas.some(f => f.some(c => c.length > 1))

  const regla = (izq: string, med: string, der: string, linea = '─'): Linea =>
    [{ t: izq + anchos.map(a => linea.repeat(a + 2)).join(med) + der, tipo: 'borde' }]
  const fila = (f: string[][], tipo: Trozo['tipo']): Linea[] => {
    const alto = Math.max(...f.map(c => c.length))
    return Array.from({ length: alto }, (_, k) => {
      const linea: Linea = [{ t: '│', tipo: 'borde' }]
      f.forEach((c, i) => linea.push({ t: ` ${rellenar(c[k] ?? '', anchos[i]!)} `, tipo }, { t: '│', tipo: 'borde' }))
      return linea
    })
  }

  const salida: Linea[] = [regla('┌', '┬', '┐'), ...fila(envueltas[0] ?? [], 'cabecera'), regla('╞', '╪', '╡', '═')]
  envueltas.slice(1).forEach((f, j) => {
    if (j > 0 && multilinea) salida.push(regla('├', '┼', '┤'))
    salida.push(...fila(f, 'celda'))
  })
  salida.push(regla('└', '┴', '┘'))
  return salida
}

export function dibujarTabla(filas: string[][], ancho: number): string {
  return grillaLineas(filas, ancho).map(l => l.map(x => x.t).join('')).join('\n')
}

export type Segmento = { tipo: 'md'; texto: string } | { tipo: 'tabla'; filas: string[][] }

// Separa el texto en trozos de markdown y tablas (las de dentro de un bloque
// de código no cuentan).
export function segmentar(texto: string): Segmento[] {
  const lineas = texto.split('\n')
  const segmentos: Segmento[] = []
  let md: string[] = []
  const cerrarMd = () => {
    const t = md.join('\n').replace(/^\n+|\n+$/g, '')
    if (t.trim()) segmentos.push({ tipo: 'md', texto: t })
    md = []
  }
  let enFence = false
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]!
    if (/^\s*(```|~~~)/.test(l)) enFence = !enFence
    if (!enFence && esFila(l) && !esSeparador(l) && i + 1 < lineas.length && esSeparador(lineas[i + 1]!)) {
      const filas = [partirFila(l)]
      let j = i + 2
      while (j < lineas.length && esFila(lineas[j]!) && !esSeparador(lineas[j]!)) filas.push(partirFila(lineas[j++]!))
      cerrarMd()
      segmentos.push({ tipo: 'tabla', filas })
      i = j - 1
      continue
    }
    md.push(l)
  }
  cerrarMd()
  return segmentos
}

// Reemplaza cada tabla por su grilla en un bloque de código (versión texto).
export function reemplazarTablas(texto: string, ancho: number): string {
  const segs = segmentar(texto)
  if (!segs.some(s => s.tipo === 'tabla')) return texto
  return segs.map(s => (s.tipo === 'md' ? s.texto : '```\n' + dibujarTabla(s.filas, ancho) + '\n```')).join('\n\n')
}
