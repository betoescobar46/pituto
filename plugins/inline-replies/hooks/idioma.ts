// Idioma de lo que el mod escribe: las etiquetas en pantalla, los avisos y los bloques que van
// a Claude. Con la opción `language` en "auto" manda el `language` de settings.json de Claude
// Code (el idioma en que el usuario le pidió a Claude que responda); si no está, la variable
// LANG del sistema. Cualquier cosa que no sea español sale en inglés.
export type Idioma = 'es' | 'en'

const ESPANOL = /^\s*(es\b|es[-_]|spa|español|espanol|spanish|castellano)/i

export function idiomaDe(opcion: unknown, language: unknown, lang: string | undefined): Idioma {
  if (opcion === 'es' || opcion === 'en') return opcion
  if (typeof language === 'string' && language.trim() !== '') return ESPANOL.test(language) ? 'es' : 'en'
  return ESPANOL.test(lang ?? '') ? 'es' : 'en'
}

type Textos = {
  sinRespuesta: string
  lineaYaEsta: (numero: string) => string
  marcaPrimero: string
  textoYaEsta: string
  formato: string
  preguntasCabecera: string
  respondida: (numero: string, pregunta: string, respuesta: string) => string
  asumida: (numero: string, pregunta: string, recomendada: string) => string
  abierta: (numero: string, pregunta: string) => string
  preguntasPie: string
  citasCabecera: string
}

const ES: Textos = {
  sinRespuesta: 'sin respuesta',
  lineaYaEsta: n => `La línea ${n} ya está en el prompt: edítala ahí`,
  marcaPrimero: 'Primero marca con el mouse el texto que quieres citar',
  textoYaEsta: 'Ese texto ya está en el prompt',
  // Va en el system prompt de cada pedido, también el de los subagentes: por eso arranca
  // condicionado a estar conversando con el usuario.
  formato:
    'Preguntas al usuario: si estás conversando directamente con él (no como subagente), las responde ' +
    'desde el prompt con el número de cada una delante. Van en tu mensaje final del turno, no en el texto ' +
    'entre herramientas (ese puede no verse ni numerarse). Escribe cada pregunta donde vaya natural en el ' +
    'texto, envuelta en ⟦ ⟧ ("...y antes de seguir, ⟦¿lo subo ahora o espero a mañana?⟧"), sin juntarlas ' +
    'al final ni repetirlas en una lista: se ve numerada en su lugar, así que no le pongas número ni ' +
    'viñeta propios. Cada una directa, entre ¿ y ?, y que ' +
    'se entienda leída sola. No juntes dos temas en una pregunta, pero una variante o aclaración ("¿o fue ' +
    'por otra cosa?") va dentro de la misma. Si se contesta eligiendo entre pocas alternativas cerradas, ' +
    'agrégalas dentro tras " | " y marca con * la que recomiendas (⟦¿Lo dejo en azul o en rojo? | *Azul | ' +
    'Rojo⟧): si no responde esa pregunta, se asume la recomendada. Nunca marques recomendada en una ' +
    'pregunta que autoriza algo irreversible o que sale hacia afuera (publicar, enviar, borrar, ' +
    'sobrescribir, pagar, commit, push): esas se contestan explícitamente o no se hacen. Solo marca lo que el usuario debe ' +
    'contestar, nunca retóricas ni citas; máximo 6. Con su mensaje llega un bloque que dice qué pregunta ' +
    'es cada número y qué contestó.',
  preguntasCabecera:
    'Preguntas que marcaste en tu respuesta anterior y lo que el usuario contestó (en su mensaje, ' +
    'el número al inicio de una línea es la respuesta a esa pregunta):',
  respondida: (n, p, r) => `${n} ${p} → ${r}`,
  asumida: (n, p, rec) => `${n} ${p} → sin respuesta; recomendaste "${rec}": asúmela, salvo que el mensaje diga otra cosa`,
  abierta: (n, p) => `${n} ${p} → sin respuesta; si el mensaje no la contesta, decide tú y sigue (no la repitas salvo que te bloquee)`,
  preguntasPie:
    'Una pregunta sin respuesta nunca autoriza nada irreversible ni que salga hacia afuera (publicar, ' +
    'enviar, borrar, sobrescribir, pagar, commit o push): si era eso, vuelve a preguntar antes de hacerlo.',
  citasCabecera:
    'Citas: el usuario marcó estos trozos de tu respuesta anterior; en su mensaje, cada línea "> …" ' +
    'es el comienzo de una. Texto completo, en el mismo orden:',
}

const EN: Textos = {
  sinRespuesta: 'if unanswered',
  lineaYaEsta: n => `Line ${n} is already in the prompt: edit it there`,
  marcaPrimero: 'Select the text you want to quote with the mouse first',
  textoYaEsta: 'That text is already in the prompt',
  formato:
    'Questions for the user: when you are talking to them directly (not as a subagent), they answer ' +
    'from the prompt with each question\'s number in front. Put them in your final message of the turn, ' +
    'not in text between tool calls (that may not be shown or numbered). Write each question where it ' +
    'belongs in the text, wrapped in ⟦ ⟧ ("...and before going on, ⟦should I push now or wait until ' +
    'tomorrow?⟧"), without collecting them at the end or repeating them as a list: each one is shown ' +
    'numbered in place, so don\'t add your own number or bullet. Make each one direct, ending in ?, and ' +
    'understandable on its own. Don\'t mix two topics in one question, but a variant or clarification ' +
    '("or was it something else?") belongs inside the same one. If it is answered by picking among a few ' +
    'closed alternatives, add them inside after " | " and mark the one you recommend with * ' +
    '(⟦Blue or red? | *Blue | Red⟧): if the user doesn\'t answer that question, the recommended one is ' +
    'assumed. Never mark a recommendation on a question that authorizes something irreversible or ' +
    'outward-facing (publishing, sending, deleting, overwriting, paying, commit, push): those get an ' +
    'explicit answer or don\'t happen. Mark only what the user must answer, never rhetorical questions ' +
    'or quotes; at most 6. Their message arrives with a block saying which question each number is and ' +
    'what they answered.',
  preguntasCabecera:
    'Questions you marked in your previous reply and what the user answered (in their message, a ' +
    'number at the start of a line is the answer to that question):',
  respondida: (n, p, r) => `${n} ${p} → ${r}`,
  asumida: (n, p, rec) => `${n} ${p} → unanswered; you recommended "${rec}": assume it, unless the message says otherwise`,
  abierta: (n, p) => `${n} ${p} → unanswered; if the message doesn't answer it, decide yourself and go on (don't ask again unless it blocks you)`,
  preguntasPie:
    'An unanswered question never authorizes anything irreversible or outward-facing (publishing, ' +
    'sending, deleting, overwriting, paying, commit or push): if that was the question, ask again before doing it.',
  citasCabecera:
    'Quotes: the user marked these parts of your previous reply; in their message, each "> …" line ' +
    'is the beginning of one. Full text, in the same order:',
}

export const textos = (idioma: Idioma): Textos => (idioma === 'en' ? EN : ES)
