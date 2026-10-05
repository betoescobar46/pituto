// Acorta la pista nativa bajo el prompt: fuera los recordatorios de shift+tab y de agentes; lo demás
// (esc to interrupt, avisos) pasa intacto.
export function pistaCorta(hint: string): string {
  return hint
    .replace(/\(shift\+tab to cycle\)/, '')
    .replace(/←\s*for agents/, '')
    .replace(/^[\s·]+|[\s·]+$/g, '')
    .replace(/(\s*·\s*){2,}/g, ' · ')
}

