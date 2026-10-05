export type Bloque = { texto: string; tipo: 'parrafo' | 'item' | 'codigo' | 'tabla' | 'titulo' }

const ITEM = /^ {0,1}(?:[-*+]|\d+[.)])\s+/
const CERCO = /^\s*(```|~~~)/
const TABLA = /^\s*\|/
const TITULO = /^\s{0,3}#{1,6}\s/

// Parte el markdown de una respuesta en los trozos que se pueden citar: párrafos, cada ítem
// de lista de primer nivel (con sus sub-ítems), tablas, bloques de código y títulos enteros.
export function partirBloques(md: string): Bloque[] {
  const salida: Bloque[] = []
  let actual: Bloque | null = null
  let cerco: string | null = null
  const cerrar = () => {
    if (actual && actual.texto.trim() !== '') salida.push({ ...actual, texto: actual.texto.replace(/\s+$/, '') })
    actual = null
  }
  for (const linea of md.split('\n')) {
    if (cerco) {
      actual!.texto += '\n' + linea
      if (linea.trim().startsWith(cerco)) {
        cerco = null
        cerrar()
      }
      continue
    }
    const abre = CERCO.exec(linea)
    if (abre) {
      cerrar()
      cerco = abre[1]!
      actual = { texto: linea, tipo: 'codigo' }
      continue
    }
    if (linea.trim() === '') {
      cerrar()
      continue
    }
    if (TABLA.test(linea)) {
      if (actual?.tipo !== 'tabla') {
        cerrar()
        actual = { texto: linea, tipo: 'tabla' }
      } else actual.texto += '\n' + linea
      continue
    }
    if (TITULO.test(linea)) {
      cerrar()
      salida.push({ texto: linea.trim(), tipo: 'titulo' })
      continue
    }
    if (ITEM.test(linea)) {
      cerrar()
      actual = { texto: linea, tipo: 'item' }
      continue
    }
    if (actual && actual.tipo !== 'tabla') actual.texto += '\n' + linea
    else {
      cerrar()
      actual = { texto: linea, tipo: 'parrafo' }
    }
  }
  if (cerco) cerco = null
  cerrar()
  return salida
}

const citar = (texto: string): string =>
  texto
    .split('\n')
    .map(l => (l.trim() === '' ? '>' : `> ${l}`))
    .join('\n')

// El mensaje: cada cita como bloque "> ..." con su comentario debajo, y al final lo que
// escribió aparte (en el prompt). Una cita sin comentario va igual: apunta a qué se refiere.
export function armarMensaje(citas: { texto: string; comentario: string }[], extra = ''): string {
  const partes = citas.map(c => [citar(c.texto), c.comentario.trim()].filter(Boolean).join('\n'))
  return [...partes, extra.trim()].filter(Boolean).join('\n\n')
}

// Una línea para la banda: el comienzo de la cita sin marcas de markdown.
export function resumen(texto: string, ancho: number): string {
  const plano = texto
    .replace(/```[^\n]*\n?/g, '')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const max = Math.max(10, ancho)
  return plano.length > max ? plano.slice(0, max - 1) + '…' : plano
}
