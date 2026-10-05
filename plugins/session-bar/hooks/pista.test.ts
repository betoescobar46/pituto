import { expect, test } from 'claude-code/testing'

import { pistaCorta } from './pista'

test('P1: la pista pierde los recordatorios fijos y conserva lo demás', () => {
  expect(pistaCorta('(shift+tab to cycle) · ← for agents')).toBe('')
  expect(pistaCorta('esc to interrupt · ← for agents')).toBe('esc to interrupt')
  expect(pistaCorta('? for shortcuts')).toBe('? for shortcuts')
})
