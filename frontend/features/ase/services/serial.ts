// S9.5b: the ASE serial — a deterministic seven-digit fingerprint for a
// person, not a row id. Everything here is domain-agnostic: it hashes
// strings, formats and validates a check-digited serial, and resolves
// collisions. It has no idea what a "machine" or a "registry country" is —
// the caller supplies the three-digit registry prefix and the hash input;
// this module only knows the shape AAA-BBBC.

// A small, deterministic 32-bit string hash (FNV-1a) — same input always
// produces the same output, on any platform, which is the one property the
// serial's determinism acceptance test depends on. Not cryptographic; this
// isn't a security boundary, it's a stable fingerprint.
function stableHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** BBB: three digits from a stable hash of immutable identity attributes. */
export function computeBBB(hashInput: string): number {
  return stableHash(hashInput) % 1000
}

// Distinct, non-repeating weights over the six AAA+BBB digits — a classic
// mod-11 scheme, so a single mis-transcribed or transposed digit almost
// always changes the remainder and fails validation.
const CHECK_WEIGHTS = [7, 6, 5, 4, 3, 2]

/** C: a mod-11 check digit over the first six digits (AAABBB). A remainder that would need the symbol "10" folds to 0 — the serial is defined to be seven plain digits, never an X. */
export function computeCheckDigit(sixDigits: string): number {
  if (!/^\d{6}$/.test(sixDigits)) {
    throw new Error(`computeCheckDigit: expected exactly six digits, got "${sixDigits}"`)
  }
  const sum = sixDigits
    .split('')
    .reduce((acc, digit, i) => acc + Number(digit) * CHECK_WEIGHTS[i], 0)
  const check = (11 - (sum % 11)) % 11
  return check === 10 ? 0 : check
}

export function formatSerial(aaa: string, bbb: number, check: number): string {
  return `${aaa}-${String(bbb).padStart(3, '0')}${check}`
}

/** The seven bare digits, no hyphen — what validation and lookups actually operate on. */
export function serialDigits(serial: string): string {
  return serial.replace(/-/g, '')
}

/** A mis-typed serial (any single-digit error, most transpositions) fails this. */
export function validateSerial(serial: string): boolean {
  const digits = serialDigits(serial)
  if (!/^\d{7}$/.test(digits)) return false
  const six = digits.slice(0, 6)
  const check = Number(digits[6])
  return computeCheckDigit(six) === check
}

/** The everyday shorthand — scoped to one campaign, never a lookup key. */
export function lastFourDigits(serial: string): string {
  return serialDigits(serial).slice(-4)
}

export function maskedSerial(serial: string): string {
  return `•••${lastFourDigits(serial)}`
}

export interface SerialIssuance {
  serial: string
  /** True if the naturally-hashed BBB was already taken within this registry and had to be incremented. */
  collided: boolean
  /** How many increments it took to land on a free BBB (0 when there was no collision). */
  attempts: number
}

/**
 * Issues serials one registry (AAA) at a time, remembering what it's already
 * handed out so a second person hashing to the same BBB within the same
 * registry is detected and resolved, not silently overwritten — "collisions
 * are not optional to handle." Each registry's BBB space is independent, the
 * same way two countries' workOrder registries can each issue their own 042
 * without conflict.
 */
export class SerialIssuer {
  private usedByRegistry = new Map<string, Set<number>>()

  issue(aaa: string, hashInput: string): SerialIssuance {
    const used = this.usedByRegistry.get(aaa) ?? new Set<number>()
    let bbb = computeBBB(hashInput)
    let attempts = 0
    const collided = used.has(bbb)
    while (used.has(bbb)) {
      bbb = (bbb + 1) % 1000
      attempts++
      if (attempts > 1000) {
        throw new Error(`SerialIssuer: exhausted the BBB space for registry ${aaa}`)
      }
    }
    used.add(bbb)
    this.usedByRegistry.set(aaa, used)
    const six = `${aaa}${String(bbb).padStart(3, '0')}`
    const check = computeCheckDigit(six)
    return { serial: formatSerial(aaa, bbb, check), collided, attempts }
  }
}
