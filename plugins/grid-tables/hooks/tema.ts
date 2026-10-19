import type { EngineInterface } from 'claude-code'

// Claro u oscuro según el fondo real de la terminal, para elegir los colores fijos (hex) del mod.
// Claude Code con theme "auto" lo resuelve solo pero no se lo cuenta a los mods: aquí se repite el
// cálculo con su theme, la config de Ghostty/cmux (theme = light:A,dark:B) y la apariencia de macOS.
export type Tema = 'claro' | 'oscuro'

export const temaDeHex = (hex: string): Tema | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1] ?? '', 16)
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return lum > 0.5 ? 'claro' : 'oscuro'
}

// Valor de la última línea `clave = valor` (en Ghostty manda la última).
export const valorGhostty = (texto: string, clave: string): string | null => {
  let valor: string | null = null
  for (const linea of texto.split('\n')) {
    const m = /^\s*([\w-]+)\s*=\s*(.*?)\s*$/.exec(linea)
    if (m && m[1] === clave) valor = (m[2] ?? '').replace(/^"(.*)"$/, '$1')
  }
  return valor || null
}

// "light:A,dark:B" o "A" → el nombre del theme que corresponde a la apariencia.
export const nombreTema = (valor: string, oscuro: boolean): string => {
  const partes = valor.split(',').map(p => p.trim())
  const de = (lado: string) => partes.find(p => p.startsWith(`${lado}:`))?.slice(lado.length + 1).trim()
  return (oscuro ? de('dark') : de('light')) ?? partes[0] ?? valor
}

let actual: Tema = 'oscuro'
let vigia: { cancel: () => void } | null = null

export const tema = (): Tema => actual

async function apariencia($: EngineInterface, home: string): Promise<boolean> {
  // cmux puede fijar su propia apariencia; "system" sigue a macOS.
  const cmux = await $.fs.read(`${home}/.config/cmux/cmux.json`).catch(() => '')
  const fija = /"appearance"\s*:\s*"(light|dark)"/.exec(cmux)?.[1]
  if (fija) return fija === 'dark'
  const r = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle'], { timeoutMs: 3000 }).catch(() => null)
  return r?.stdout.trim() === 'Dark'
}

export async function detectarTema($: EngineInterface): Promise<Tema> {
  const fila = (await $.config.list().catch(() => [])).find(r => r.key === 'theme')
  const propio = String(fila?.value ?? 'auto')
  if (propio.startsWith('light')) return 'claro'
  if (propio.startsWith('dark')) return 'oscuro'
  const home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
  if (!home) return 'oscuro'
  // El de cmux va después: lo que escribe `cmux themes set` manda sobre el config de Ghostty.
  const config = [
    `${home}/.config/ghostty/config`,
    `${home}/Library/Application Support/com.mitchellh.ghostty/config`,
    `${home}/Library/Application Support/com.cmuxterm.app/config.ghostty`,
  ]
  const texto = (await Promise.all(config.map(f => $.fs.read(f).catch(() => '')))).join('\n')
  const fondo = valorGhostty(texto, 'background')
  if (fondo) return temaDeHex(fondo) ?? 'oscuro'
  const valor = valorGhostty(texto, 'theme')
  // Sin theme, Ghostty usa su fondo oscuro de fábrica.
  if (!valor) return 'oscuro'
  const nombre = nombreTema(valor, await apariencia($, home))
  const rutas = nombre.startsWith('/')
    ? [nombre]
    : [
        `${home}/.config/ghostty/themes/${nombre}`,
        `/Applications/cmux.app/Contents/Resources/ghostty/themes/${nombre}`,
        `/Applications/Ghostty.app/Contents/Resources/ghostty/themes/${nombre}`,
      ]
  for (const ruta of rutas) {
    const hex = valorGhostty(await $.fs.read(ruta).catch(() => ''), 'background')
    if (hex) return temaDeHex(hex) ?? 'oscuro'
  }
  return 'oscuro'
}

async function revisar($: EngineInterface): Promise<void> {
  const nuevo = await detectarTema($).catch(() => actual)
  if (nuevo === actual) return
  actual = nuevo
  $.ui.invalidate('ui.render')
}

// Detecta ahora y cada 10 s; al cambiar, redibuja. Una recarga del mod reemplaza el vigía.
export function vigilarTema($: EngineInterface): void {
  vigia?.cancel()
  $.clock.after(0, () => void revisar($))
  vigia = $.clock.every(10000, () => void revisar($))
}
