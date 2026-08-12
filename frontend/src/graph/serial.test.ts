import { describe, expect, it } from 'vitest'
import { serialFor } from './serial'

describe('graph/serial (S8.8)', () => {
  it('is deterministic for the same id', () => {
    expect(serialFor('climber-7')).toBe(serialFor('climber-7'))
  })

  it('differs between different ids (in the general case)', () => {
    expect(serialFor('climber-7')).not.toBe(serialFor('climber-8'))
  })

  it('is always a masked 4-digit serial', () => {
    expect(serialFor('climber-0')).toMatch(/^•••\d{4}$/)
  })
})
