// Selector de modelo: el elegido vale solo para la sesión en curso. No pasa por /model, que lo
// guardaría como default de las sesiones nuevas; turn.step lo pone pedido a pedido.
export const MODELOS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-haiku-4-5-20251001'] as const
export type Modelo = (typeof MODELOS)[number]

export const esModelo = (x: unknown): x is Modelo => typeof x === 'string' && (MODELOS as readonly string[]).includes(x)

// El id que va en el pedido: el elegido, con el sufijo de ventana ([1m]) del que traía el
// pedido si el elegido lo admite (Haiku no tiene ventana de un millón).
export function modeloPedido(actual: string, elegido: Modelo): string {
  const sufijo = /\[1m\]$/i.exec(actual)?.[0] ?? ''
  return elegido.includes('haiku') ? elegido : `${elegido}${sufijo}`
}

// ¿El pedido ya va con ese modelo? Compara sin el sufijo de ventana.
export const mismoModelo = (actual: string, elegido: Modelo): boolean => actual.replace(/\[1m\]$/i, '') === elegido
