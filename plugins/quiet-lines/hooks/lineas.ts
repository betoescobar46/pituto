// El texto de las dos líneas secundarias, armado aquí porque el motor no deja
// poner en cursiva su propio dibujo.

export function duracion(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Del transcript: la hora de cierre de cada turno, por uuid y por duración.
export type Cierres = { porId: Map<string, number>; porDuracion: Array<[number, number]> }

export function leerCierres(jsonl: string): Cierres {
  const porId = new Map<string, number>()
  const porDuracion: Array<[number, number]> = []
  for (const linea of jsonl.split('\n')) {
    if (!linea.includes('"turn_duration"')) continue
    let d: { subtype?: string; uuid?: string; timestamp?: string; durationMs?: number }
    try { d = JSON.parse(linea) } catch { continue }
    if (d.subtype !== 'turn_duration' || !d.timestamp) continue
    const ms = Date.parse(d.timestamp)
    if (Number.isNaN(ms)) continue
    if (d.uuid) porId.set(d.uuid, ms)
    if (typeof d.durationMs === 'number') porDuracion.push([d.durationMs, ms])
  }
  return { porId, porDuracion }
}

// La línea trae la misma duración, al milisegundo, que quedó escrita en el transcript y que avisa
// turn.complete: se busca esa, entre las que no tomó otra línea. Del transcript solo valen los
// cierres anteriores a `antesDe` (la carga del mod); los de después los anota turn.complete. Una
// tolerancia, aunque sea de segundos, le daba a un turno nuevo la hora de uno viejo parecido.
export function cierrePorDuracion(c: Cierres, durationMs: number, tomadas: Set<number> = new Set(), antesDe = Infinity): number | undefined {
  for (const [d, ms] of c.porDuracion) {
    if (d === durationMs && !tomadas.has(ms) && ms < antesDe) return ms
  }
  return undefined
}

// Entre los cierres anotados en esta sesión, el de la misma duración que nadie tomó.
export function cierreVivo(vivos: ReadonlyArray<{ durationMs: number; ms: number }>, durationMs: number, tomadas: Set<number>): number | undefined {
  return vivos.find(v => v.durationMs === durationMs && !tomadas.has(v.ms))?.ms
}

type Llamada = { tool: string }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

// "Read 3 files, ran 2 shell commands", al estilo de la línea del motor.
export function resumen(calls: ReadonlyArray<Llamada>): string {
  const cuenta = new Map<string, number>()
  for (const c of calls) {
    const tipo = c.tool === 'Read' ? 'read' : c.tool === 'Grep' || c.tool === 'Glob' ? 'search' : c.tool === 'Bash' ? 'bash' : 'tool'
    cuenta.set(tipo, (cuenta.get(tipo) ?? 0) + 1)
  }
  const partes: string[] = []
  const n = (k: string) => cuenta.get(k) ?? 0
  if (n('read')) partes.push(`read ${plural(n('read'), 'file', 'files')}`)
  if (n('search')) partes.push(`searched for ${plural(n('search'), 'pattern', 'patterns')}`)
  if (n('bash')) partes.push(`ran ${plural(n('bash'), 'shell command', 'shell commands')}`)
  if (n('tool')) partes.push(`called ${plural(n('tool'), 'tool', 'tools')}`)
  const texto = partes.join(', ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
