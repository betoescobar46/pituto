// Barra de effort: un botón por nivel. El nivel elegido vale solo para la sesión en curso; no
// pasa por /effort, que lo guardaría como default de las sesiones nuevas (modelSettings).
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
