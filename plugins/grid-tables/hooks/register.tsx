import type { Register } from 'claude-code'

import { grillaLineas, segmentar } from './grilla'
import { tema, vigilarTema } from './tema'

// Colores de la grilla. Cualquier hex sirve.
// Con la terminal clara, tonos más oscuros: el amarillo se pierde sobre el blanco.
const COLORES = {
  oscuro: { borde: '#D19A66', cabecera: '#E5C07B' },
  claro: { borde: '#b5733a', cabecera: '#8a5a00' },
} as const
const COLOR = (): Record<string, string | undefined> => ({ ...COLORES[tema()], celda: undefined }) // celda: el color normal del terminal

// Columnas que se reservan: la viñeta "● " del transcript más un margen
// para que la grilla no toque el borde ni el panel lateral.
const MARGEN = 4

export const register: Register = on => {
  // Ancho de la columna del transcript. Solo la banda sobre el prompt lo
  // conoce (bodyColumns se angosta cuando hay un panel acoplado al lado).
  let anchoTranscript: number | undefined

  on('session.start', async ($, e, next) => {
    if (e.isInteractive) vigilarTema($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    const ancho = e.props.bodyColumns
    if (ancho !== anchoTranscript) {
      anchoTranscript = ancho
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (!e.props.text.includes('|')) return next(e)
    const segmentos = segmentar(e.props.text)
    if (!segmentos.some(s => s.tipo === 'tabla')) return next(e)

    const ancho = (anchoTranscript ?? e.viewport?.columns ?? 80) - MARGEN
    const { Box, Markdown, Text } = $.ui.resolve(e)

    // El árbol propio reemplaza la fila entera, así que la viñeta y la
    // sangría que el motor pone a cada respuesta van dibujadas acá.
    return (
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text>{e.props.isFirstOfReply ? '●' : ' '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {segmentos.map((s, n) =>
            s.tipo === 'md' ? (
              <Box key={`m${n}`} marginTop={n > 0 ? 1 : 0}>
                <Markdown text={s.texto} />
              </Box>
            ) : (
              <Box key={`t${n}`} flexDirection="column" marginTop={n > 0 ? 1 : 0}>
                {grillaLineas(s.filas, ancho).map((linea, k) => (
                  <Text key={`t${n}l${k}`} wrap="truncate">
                    {linea.map((trozo, j) => (
                      <Text key={`t${n}l${k}s${j}`} color={COLOR()[trozo.tipo]} bold={trozo.tipo === 'cabecera'}>
                        {trozo.t}
                      </Text>
                    ))}
                  </Text>
                ))}
              </Box>
            ),
          )}
        </Box>
      </Box>
    )
  })
}
