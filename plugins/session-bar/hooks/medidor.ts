// Modelo, contexto y límite de 5 horas junto a la carpeta, en vez de en la status line.

// claude-opus-5-5 → O5.5, claude-haiku-4-5-20251001 → H4.5, con " 1M" si la ventana es de un millón.
export function modeloCorto(id: string): string {
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?!\d)/i.exec(id)
  if (!m) return id.replace(/^claude-/, '')
  const fam = { opus: 'O', sonnet: 'S', haiku: 'H', fable: 'F' }[m[1]!.toLowerCase() as 'opus']
  const millon = /\[1m\]|1m/i.test(id) ? ' 1M' : ''
  return `${fam}${m[2]}${m[3] ? `.${m[3]}` : ''}${millon}`
}

// Mismos cortes que tenía la status line.
export function colorContexto(p: number): string {
  return p < 50 ? 'greenBright' : p < 75 ? 'yellowBright' : p < 90 ? '#ff8c3a' : 'redBright'
}

export function colorLimite(p: number): string {
  return p >= 90 ? 'redBright' : p >= 70 ? '#ff8c3a' : p >= 50 ? 'yellowBright' : 'greenBright'
}
