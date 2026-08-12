// Shared seeded PRNG for everything under src/graph/ — one implementation,
// not one copy per file. mulberry32 for the generator itself, a small
// string hash so any entity id can seed its own independent stream without
// a shared numeric index (the same technique ase/detection.ts's
// `stableUnit` and ase/exposure.ts use, reimplemented here rather than
// imported — src/graph/ stays independent of src/ase/ except for the
// handful of pure reference-data constants S8.3 explicitly reuses).

export function mulberry32(seed: number): () => number {
  let a = seed
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedFromString(s: string, salt: number): number {
  let h = salt
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h
}

export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}

/** Fisher-Yates using a seeded generator — deterministic given the same `rand`. */
export function seededShuffle<T>(items: T[], rand: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Weighted pick from a `{ key: weight }` table — weights need not sum to 1. */
export function weightedPick<K extends string>(rand: () => number, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let roll = rand() * total
  for (const [key, w] of entries) {
    roll -= w
    if (roll <= 0) return key
  }
  return entries[entries.length - 1][0]
}
