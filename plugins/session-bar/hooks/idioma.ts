// Idioma del panel, de la barra, de los avisos y de los pedidos al modelo. Con la opción
// `language` en "auto" manda el `language` de settings.json de Claude Code (el idioma en que el
// usuario le pidió a Claude que responda); si no está, la variable LANG. Lo que no sea español
// sale en inglés.
export type Idioma = 'es' | 'en'

const ESPANOL = /^\s*(es\b|es[-_]|spa|español|espanol|spanish|castellano)/i

export function idiomaDe(opcion: unknown, language: unknown, lang: string | undefined): Idioma {
  if (opcion === 'es' || opcion === 'en') return opcion
  if (typeof language === 'string' && language.trim() !== '') return ESPANOL.test(language) ? 'es' : 'en'
  return ESPANOL.test(lang ?? '') ? 'es' : 'en'
}

export type Textos = {
  titulo: string
  comando: string
  llegoRespuesta: string
  agenteVencido: string
  errorApi: (detalle: string) => string
  sinLanzar: (motivo: string) => string
  sinIdentificar: string
  sinRespuesta: (motivo: string) => string
  error: (detalle: string) => string
  sinInforme: string
  agenteFallo: (motivo: string) => string
  agenteTerminado: string
  respuestaEnPanel: string
  soloLectura: (motivo: string) => string
  noCompacto: (motivo: string) => string
  compactada: (antes: string, despues: string) => string
  noPudoCompactar: (detalle: string, turno: boolean) => string
  noPudoClear: (detalle: string) => string
  compactarTrabajando: string
  clearTrabajando: string
  panelEnEspera: (motivo: string) => string
  panelError: (detalle: string) => string
  botonCompactar: { confirmar: string; compactando: string; avance: (pct: number) => string }
  botonBorrar: { confirmar: string; borrando: string }
  modelo: string
  conContexto: string
  suelta: string
  limpiar: string
  pistaContexto: string
  pistaSuelta: string
  vacio: string
  buscando: string
  pensando: string
  placeholder: string
  enviar: string
  sinCaja: string
  usuario: string
  tu: string
  conversacionPrevia: string
  pregunta: string
  preguntaOriginal: string
  hoy: (fecha: string) => string
  sistema: (persona: string) => string
  avisoFork: string
  avisoAgente: string
}

const ES: Textos = {
  titulo: 'Chat lateral',
  comando: 'Abre o cierra el chat lateral',
  llegoRespuesta: 'Chat lateral: llegó una respuesta',
  agenteVencido: '(el agente no ha respondido en 8 minutos; si su respuesta llega, aparecerá aquí. Lo puedes ver en /tasks.)',
  errorApi: d => `error de la API (${d})`,
  sinLanzar: m => `(no se pudo lanzar el agente: ${m})`,
  sinIdentificar: '(el agente partió sin identificarse; si responde, aparecerá aquí)',
  sinRespuesta: m => `(sin respuesta: ${m})`,
  error: d => `(error: ${d})`,
  sinInforme: '(el agente no dejó informe)',
  agenteFallo: m => `(el agente falló: ${m})`,
  agenteTerminado: 'chat lateral: agente terminado',
  respuestaEnPanel: 'chat lateral: la respuesta quedó en el panel',
  soloLectura: m => `chat lateral: el agente es de solo lectura (${m}). Si hace falta, se pide en la sesión principal.`,
  noCompacto: m => `No se compactó: ${m}`,
  compactada: (a, d) => `Conversación compactada (${a} → ${d} tokens)`,
  noPudoCompactar: (d, turno) => `No se pudo compactar${turno ? ': espera que Claude termine el turno' : `: ${d}`}`,
  noPudoClear: d => `No se pudo hacer /clear: ${d}`,
  compactarTrabajando: 'No se puede compactar mientras Claude trabaja: espera que termine el turno',
  clearTrabajando: 'No se puede hacer /clear mientras Claude trabaja: espera que termine el turno',
  panelEnEspera: m => `chat lateral en espera: ${m}`,
  panelError: d => `chat lateral: ${d}`,
  botonCompactar: { confirmar: 'C ¿compactar? clic otra vez', compactando: 'C compactando…', avance: p => `C compactando… ${p}%` },
  botonBorrar: { confirmar: '⌫ ¿/clear? clic otra vez', borrando: '⌫ borrando…' },
  modelo: 'modelo',
  conContexto: 'Con contexto',
  suelta: 'Suelta',
  limpiar: 'Limpiar',
  pistaContexto: 'Sabe de qué hablamos; consulta correo, calendario y archivos si hace falta (solo lectura).',
  pistaSuelta: 'Sin contexto, con Sonnet.',
  vacio: 'Pregunta lo que quieras; la tarea principal sigue sola.',
  buscando: 'buscando con herramientas…',
  pensando: 'pensando…',
  placeholder: 'Pregunta algo sin interrumpir…',
  enviar: 'enviar',
  sinCaja: 'Esta superficie no tiene caja de texto.',
  usuario: 'Usuario',
  tu: 'Tú',
  conversacionPrevia: 'Conversación previa de este chat lateral:',
  pregunta: 'Pregunta:',
  preguntaOriginal: 'Pregunta original del usuario:',
  hoy: f => `Hoy es ${f}.`,
  sistema: persona =>
    'Eres un chat lateral dentro de Claude Code. Responde en español latino neutral ' +
    '(tuteo, nunca voseo), directo y corto: la respuesta primero, sin preámbulo ni resumen final.' +
    (persona ? ` ${persona}` : ''),
  avisoFork:
    '[Pregunta lateral del usuario, aparte de la tarea en curso; la lee en un panel angosto. ' +
    'No retomes la tarea. Si puedes responder solo con lo que ya está en esta conversación, ' +
    'responde directo, corto, en español latino neutral (tuteo, nunca voseo), la respuesta primero. ' +
    'Si para responder necesitas consultar algo (correo, calendario, archivos, web), NO respondas: ' +
    'escribe en la primera línea exactamente AGENTE: y debajo un encargo autocontenido para un ' +
    'agente que NO ve esta conversación: qué averiguar, con los nombres completos, correos, fechas ' +
    'y rutas que aparezcan aquí.]',
  avisoAgente:
    'Eres el chat lateral de Claude Code: el usuario te hace una pregunta aparte de su tarea ' +
    'principal y lee tu respuesta en un panel angosto. Usa las herramientas que necesites para ' +
    'averiguarlo (correo, calendario, archivos, web), pero SOLO LECTURA: nunca envíes correos ni ' +
    'mensajes, nunca crees, edites ni borres archivos, eventos o borradores, nunca ' +
    'pagues ni llenes formularios. Si la pregunta pide una acción de escritura, responde qué ' +
    'harías y que debe pedirlo en la sesión principal. Responde en español latino neutral (tuteo, ' +
    'nunca voseo), corto, la respuesta primero. Tu respuesta final es lo único que el usuario ve: ' +
    'no menciones nada ajeno a la pregunta (avisos de conectores, autorizaciones, el sistema).',
}

const EN: Textos = {
  titulo: 'Side chat',
  comando: 'Opens or closes the side chat',
  llegoRespuesta: 'Side chat: a reply arrived',
  agenteVencido: "(the agent hasn't replied in 8 minutes; if its reply arrives, it will show up here. You can watch it in /tasks.)",
  errorApi: d => `API error (${d})`,
  sinLanzar: m => `(could not start the agent: ${m})`,
  sinIdentificar: '(the agent started without identifying itself; if it replies, it will show up here)',
  sinRespuesta: m => `(no reply: ${m})`,
  error: d => `(error: ${d})`,
  sinInforme: '(the agent left no report)',
  agenteFallo: m => `(the agent failed: ${m})`,
  agenteTerminado: 'side chat: agent finished',
  respuestaEnPanel: 'side chat: the reply went to the panel',
  soloLectura: m => `side chat: the agent is read-only (${m}). If needed, ask in the main session.`,
  noCompacto: m => `Not compacted: ${m}`,
  compactada: (a, d) => `Conversation compacted (${a} → ${d} tokens)`,
  noPudoCompactar: (d, turno) => `Could not compact${turno ? ': wait for Claude to finish the turn' : `: ${d}`}`,
  noPudoClear: d => `Could not run /clear: ${d}`,
  compactarTrabajando: "Can't compact while Claude is working: wait for the turn to finish",
  clearTrabajando: "Can't run /clear while Claude is working: wait for the turn to finish",
  panelEnEspera: m => `side chat waiting: ${m}`,
  panelError: d => `side chat: ${d}`,
  botonCompactar: { confirmar: 'C compact? click again', compactando: 'C compacting…', avance: p => `C compacting… ${p}%` },
  botonBorrar: { confirmar: '⌫ /clear? click again', borrando: '⌫ clearing…' },
  modelo: 'model',
  conContexto: 'With context',
  suelta: 'Standalone',
  limpiar: 'Clear',
  pistaContexto: 'Knows what we are working on; checks mail, calendar and files if needed (read-only).',
  pistaSuelta: 'No context, with Sonnet.',
  vacio: 'Ask anything; the main task keeps going.',
  buscando: 'looking things up…',
  pensando: 'thinking…',
  placeholder: 'Ask without interrupting…',
  enviar: 'send',
  sinCaja: 'This surface has no text box.',
  usuario: 'User',
  tu: 'You',
  conversacionPrevia: 'Earlier messages in this side chat:',
  pregunta: 'Question:',
  preguntaOriginal: "User's original question:",
  hoy: f => `Today is ${f}.`,
  sistema: persona =>
    'You are a side chat inside Claude Code. Reply in English, direct and short: the answer first, ' +
    'no preamble and no closing summary.' +
    (persona ? ` ${persona}` : ''),
  avisoFork:
    "[Side question from the user, apart from the task in progress; they read it in a narrow panel. " +
    "Don't resume the task. If you can answer with what is already in this conversation, answer " +
    'directly and briefly, in English, the answer first. If answering requires looking something up ' +
    '(mail, calendar, files, web), do NOT answer: write exactly AGENT: on the first line and below it ' +
    'a self-contained brief for an agent that does NOT see this conversation: what to find out, with ' +
    'the full names, addresses, dates and paths that appear here.]',
  avisoAgente:
    'You are the side chat of Claude Code: the user asks you something apart from their main task ' +
    'and reads your reply in a narrow panel. Use whatever tools you need to find out (mail, calendar, ' +
    'files, web), but READ-ONLY: never send mail or messages, never create, edit or delete files, ' +
    'events or drafts, never pay or fill in forms. If the question asks for a write action, say what ' +
    'you would do and that it must be requested in the main session. Reply in English, briefly, the ' +
    "answer first. Your final reply is the only thing the user sees: don't mention anything beyond " +
    'the question (connector notices, authorizations, the system).',
}

export const textos = (idioma: Idioma): Textos => (idioma === 'en' ? EN : ES)
