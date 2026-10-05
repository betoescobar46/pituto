// Color por sesión: los nombres son los que acepta el /color de Claude Code (la barra del
// prompt), y cada uno lleva su color para el panel y una marca para el título de la pestaña
// de cmux. `tinte` ya no tiñe la terminal (ver scriptAplicar): solo el fondo de tus mensajes.

export type ColorSesion = { id: string; nombre: string; ink: string; tinte: string; marca: string }

export const PALETA: readonly ColorSesion[] = [
  { id: 'red', nombre: 'rojo', ink: 'red', tinte: '#3a2b30', marca: '🔴' },
  { id: 'green', nombre: 'verde', ink: 'green', tinte: '#2a362f', marca: '🟢' },
  { id: 'blue', nombre: 'azul', ink: 'blue', tinte: '#2a3242', marca: '🔵' },
  { id: 'yellow', nombre: 'amarillo', ink: 'yellow', tinte: '#37352a', marca: '🟡' },
  { id: 'purple', nombre: 'morado', ink: 'magenta', tinte: '#342c40', marca: '🟣' },
  { id: 'orange', nombre: 'naranjo', ink: '#e8833a', tinte: '#3a3029', marca: '🟠' },
  { id: 'pink', nombre: 'rosado', ink: '#e86fa8', tinte: '#3a2c37', marca: '🩷' },
  { id: 'cyan', nombre: 'calipso', ink: 'cyan', tinte: '#29373a', marca: '🩵' },
]

// Índice -1 = sin color (todo vuelve a lo normal).
export const SIN_COLOR = -1

// La opción `folderColors` del mod: "clinic=red, notes=green, billing=blue". Cada
// trozo es un texto que la ruta debe contener (sin distinguir mayúsculas) y un color de PALETA.
export type Fijo = { patron: string; id: string }

export function leerFijos(opcion: unknown): Fijo[] {
  if (typeof opcion !== 'string') return []
  return opcion
    .split(',')
    .map(par => {
      const i = par.lastIndexOf('=')
      if (i < 0) return undefined
      const patron = par.slice(0, i).trim().toLowerCase()
      const id = par.slice(i + 1).trim().toLowerCase()
      return patron && PALETA.some(c => c.id === id) ? { patron, id } : undefined
    })
    .filter((f): f is Fijo => f !== undefined)
}

// Sin un color fijo para la carpeta, se elige uno estable a partir de la ruta, entre los que
// ningún fijo usa (así los proyectos de siempre no se confunden con los demás).
export function colorPorCarpeta(cwd: string, fijos: Fijo[] = []): number {
  const ruta = cwd.toLowerCase()
  const fijo = fijos.find(f => ruta.includes(f.patron))?.id
  const usados = new Set(fijos.map(f => f.id))
  const resto = PALETA.map(c => c.id).filter(id => !usados.has(id))
  let h = 0
  for (const ch of cwd) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const id = fijo ?? resto[h % resto.length] ?? PALETA[0]!.id
  return PALETA.findIndex(c => c.id === id)
}

// Siguiente al hacer clic: recorre la paleta y, al final, "sin color".
export function siguiente(i: number): number {
  if (i === SIN_COLOR) return 0
  return i + 1 < PALETA.length ? i + 1 : SIN_COLOR
}

export const carpeta = (cwd: string): string => cwd.split('/').filter(Boolean).pop() ?? cwd

// Script de shell que pone o quita la marca en el título de la pestaña de cmux.
// Sin tinte de fondo: un OSC 11 deja la terminal en blanco en cmux 0.64.25 al cambiar de
// workspace o alternar el canvas (Ctrl+Cmd+C), y OSC 111 no la recupera (probado 2-oct-2026).
// CMUX_TAB_ID y CMUX_WORKSPACE_ID quedan obsoletas si el usuario movió la pestaña a otro
// workspace: la pestaña real se busca por CMUX_SURFACE_ID en `cmux tree`. No sirve
// `cmux identify`: el mod corre sin terminal propia y ahí `caller` sale null.
export function scriptAplicar(c: ColorSesion | undefined, titulo: string): string {
  const accion = c ? `--action rename --title ${comillas(`${c.marca} ${titulo}`)}` : '--action clear-name'
  return [
    `command -v cmux >/dev/null 2>&1 || exit 0`,
    `[ -n "$CMUX_SURFACE_ID" ] || exit 0`,
    `ref=$(env -u CMUX_WORKSPACE_ID cmux --json --id-format both tree --all </dev/null 2>/dev/null | /usr/bin/python3 -c 'import json,os,sys`,
    `sid=os.environ.get("CMUX_SURFACE_ID","").upper()`,
    `def walk(o,ws=""):`,
    `    if isinstance(o,dict):`,
    `        r=str(o.get("ref") or "")`,
    `        if r.startswith("workspace:"): ws=r`,
    `        if str(o.get("id","")).upper()==sid: print(ws, r); sys.exit(0)`,
    `        for v in o.values(): walk(v,ws)`,
    `    elif isinstance(o,list):`,
    `        for v in o: walk(v,ws)`,
    `try: walk(json.load(sys.stdin))`,
    `except Exception: pass' 2>/dev/null)`,
    `ws=\${ref%% *}; tab=\${ref#* }`,
    `if [ -n "$ws" ] && [ -n "$tab" ] && [ "$ws" != "$tab" ]; then cmux tab-action ${accion} --tab "$tab" --workspace "$ws" >/dev/null 2>&1; fi`,
    'exit 0',
  ].join('\n')
}

const comillas = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
