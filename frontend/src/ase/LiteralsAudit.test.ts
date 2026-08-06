// Verifies the one judgment call the literals audit depends on: does a
// rendered text node look like a bare authored number? This is DOM-free by
// design (see LiteralsAudit.tsx), so it's checked directly rather than via a
// live DOM walk — there's no tab mounting the panel yet to walk.

import { describe, expect, it } from 'vitest'
import { looksAuthored } from './LiteralsAudit'

describe('looksAuthored', () => {
  it.each(['42', '3.14', '-5.2', '12%', '1,234', '0'])('flags a bare number: %s', (text) => {
    expect(looksAuthored(text)).toBe(true)
  })

  it.each([' 42 ', '\n42\n'])('flags a bare number with surrounding whitespace: %j', (text) => {
    expect(looksAuthored(text)).toBe(true)
  })

  it.each(['Overview', '', 'v2', 'Step 4', 'risk score of 42', 'Q3 2026', '—'])(
    'does not flag non-numeric or mixed text: %j',
    (text) => {
      expect(looksAuthored(text)).toBe(false)
    }
  )
})
