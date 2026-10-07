// Barra de effort: un botón por nivel. El clic corre /effort <nivel>, el mismo camino que el
// nativo: cambia el nivel de la sesión (lo que muestran /model y el indicador sobre el prompt).
export const NIVELES = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Nivel = (typeof NIVELES)[number]

// Etiqueta corta de cada nivel en la barra.
export const LETRA: Record<Nivel, string> = { low: 'L', medium: 'M', high: 'H', xhigh: 'XH', max: 'Mx' }

export const esNivel = (x: unknown): x is Nivel => typeof x === 'string' && (NIVELES as readonly string[]).includes(x)

// El nivel de /effort <args>; "auto", "ultracode" o vacío no dan un nivel fijo.
export function nivelDeArgs(args: string): Nivel | null {
  const t = args.trim().split(/\s+/)[0]?.toLowerCase()
  return esNivel(t) ? t : null
}

// El default de las sesiones nuevas: el del modelo en modelSettings, si no el general.
export function nivelDeSettings(s: Record<string, unknown>, modelo: string): Nivel | null {
  const porModelo = (s.modelSettings as Record<string, { effortLevel?: unknown }> | undefined)?.[modelo]?.effortLevel
  if (esNivel(porModelo)) return porModelo
  return esNivel(s.effortLevel) ? s.effortLevel : null
}

// El nivel que dejó /effort o /model, leído de su línea de salida: "Set effort level to high…",
// "Kept effort level as medium", "Set model to Opus 5.5 … with xhigh effort", "Current effort
// level: low". null si no nombra uno (auto, Esc sin cambios).
export function nivelDeSalida(texto: string | undefined): Nivel | null {
  // La salida que queda en la conversación marca los valores entre comillas invertidas.
  const m = /effort level(?: to| as|:) `?(\w+)|\bwith `?(\w+)`? effort\b/i.exec(texto ?? '')
  const t = (m?.[1] ?? m?.[2])?.toLowerCase()
  return esNivel(t) ? t : null
}
