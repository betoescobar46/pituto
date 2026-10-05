// Saca del transcript (JSONL) la hora de cada mensaje del usuario, por uuid
// y por texto.

export type Horas = { porId: Map<string, number>; porTexto: Map<string, number> }

function textoDe(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  const partes = content.filter((b): b is { type: 'text'; text: string } => b?.type === 'text' && typeof b.text === 'string')
  // Un mensaje hecho solo de resultados de herramientas no es un prompt.
  return partes.length ? partes.map(b => b.text).join('\n') : undefined
}

export function leerHoras(jsonl: string): Horas {
  const porId = new Map<string, number>()
  const porTexto = new Map<string, number>()
  for (const linea of jsonl.split('\n')) {
    if (!linea.includes('"type":"user"')) continue
    let d: { type?: string; uuid?: string; timestamp?: string; message?: { content?: unknown } }
    try { d = JSON.parse(linea) } catch { continue }
    if (d.type !== 'user' || !d.timestamp) continue
    const texto = textoDe(d.message?.content)
    if (texto === undefined) continue
    const ms = Date.parse(d.timestamp)
    if (Number.isNaN(ms)) continue
    if (d.uuid) porId.set(d.uuid, ms)
    porTexto.set(texto.trim(), ms)
  }
  return { porId, porTexto }
}

// HH:MM en la hora local del Mac.
export function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
