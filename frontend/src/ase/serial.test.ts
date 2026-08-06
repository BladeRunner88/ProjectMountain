import { describe, expect, it } from 'vitest'
import { computeBBB, computeCheckDigit, formatSerial, lastFourDigits, maskedSerial, SerialIssuer, validateSerial } from './serial'

describe('computeBBB', () => {
  it('is deterministic for the same input', () => {
    expect(computeBBB('passport-hash|1990-01-01|James')).toBe(computeBBB('passport-hash|1990-01-01|James'))
  })
  it('is a value in [0, 999]', () => {
    for (const input of ['a', 'bb', 'ccc', 'a very long input string indeed']) {
      const bbb = computeBBB(input)
      expect(bbb).toBeGreaterThanOrEqual(0)
      expect(bbb).toBeLessThan(1000)
    }
  })
  it('differs for different inputs (not a constant)', () => {
    const values = new Set(['a', 'b', 'c', 'd', 'e'].map(computeBBB))
    expect(values.size).toBeGreaterThan(1)
  })
})

describe('computeCheckDigit + validateSerial', () => {
  it('a freshly formatted serial always validates', () => {
    for (let bbb = 0; bbb < 50; bbb++) {
      const six = `977${String(bbb).padStart(3, '0')}`
      const check = computeCheckDigit(six)
      const serial = formatSerial('977', bbb, check)
      expect(validateSerial(serial)).toBe(true)
    }
  })

  it('a single mis-typed digit fails validation', () => {
    const six = '977042'
    const check = computeCheckDigit(six)
    const serial = formatSerial('977', 42, check)
    expect(validateSerial(serial)).toBe(true)

    // Mutate one digit in the six-digit body.
    const digits = serial.replace('-', '').split('')
    digits[2] = digits[2] === '9' ? '8' : '9' // corrupt the AAA/BBB body, not the check digit
    const corrupted = digits.join('')
    expect(validateSerial(`${corrupted.slice(0, 3)}-${corrupted.slice(3)}`)).toBe(false)
  })

  it('rejects malformed input (wrong length, non-digits)', () => {
    expect(validateSerial('977-123')).toBe(false)
    expect(validateSerial('abc-defg')).toBe(false)
    expect(validateSerial('')).toBe(false)
  })

  it('computeCheckDigit throws on non-six-digit input', () => {
    expect(() => computeCheckDigit('12345')).toThrow()
    expect(() => computeCheckDigit('1234567')).toThrow()
    expect(() => computeCheckDigit('12345a')).toThrow()
  })
})

describe('lastFourDigits / maskedSerial', () => {
  it('extracts the last four bare digits', () => {
    const serial = formatSerial('977', 421, computeCheckDigit('977421'))
    expect(lastFourDigits(serial)).toBe(serial.replace('-', '').slice(-4))
    expect(maskedSerial(serial)).toBe(`•••${lastFourDigits(serial)}`)
  })
})

describe('SerialIssuer (collision handling)', () => {
  it('two different inputs in the same registry normally get different serials', () => {
    const issuer = new SerialIssuer()
    const a = issuer.issue('977', 'passport-a|1990-01-01|Alice')
    const b = issuer.issue('977', 'passport-b|1985-06-12|Bob')
    expect(a.serial).not.toBe(b.serial)
    expect(a.collided).toBe(false)
    expect(b.collided).toBe(false)
  })

  it('identical hash inputs collide, and the second issuance increments BBB rather than reusing it', () => {
    const issuer = new SerialIssuer()
    const first = issuer.issue('977', 'same-input')
    const second = issuer.issue('977', 'same-input')
    expect(first.collided).toBe(false)
    expect(second.collided).toBe(true)
    expect(second.attempts).toBeGreaterThan(0)
    expect(second.serial).not.toBe(first.serial)
    expect(validateSerial(first.serial)).toBe(true)
    expect(validateSerial(second.serial)).toBe(true)
  })

  it('the same BBB can be issued independently in two different registries — collision tracking is per-registry', () => {
    const issuer = new SerialIssuer()
    const nepal = issuer.issue('977', 'shared-input')
    const pakistan = issuer.issue('092', 'shared-input')
    expect(nepal.collided).toBe(false)
    expect(pakistan.collided).toBe(false)
    // Same BBB body (the check digit differs because it's computed over
    // AAABBB, not BBB alone — the registry prefix is part of what's checked).
    const nepalBBB = nepal.serial.replace('-', '').slice(3, 6)
    const pakistanBBB = pakistan.serial.replace('-', '').slice(3, 6)
    expect(nepalBBB).toBe(pakistanBBB)
    expect(nepal.serial).not.toBe(pakistan.serial)
  })
})
