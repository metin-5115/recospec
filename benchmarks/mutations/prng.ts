/**
 * Deterministic PRNG (mulberry32). Every mutation operator takes a seeded
 * `Rng` so a benchmark run is fully reproducible — same seed, same mutated DOM,
 * same survival numbers. `Math.random()` is banned in this repo for exactly
 * this reason (it would break resume/reproducibility).
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [min, max]. */
  int(min: number, max: number): number
  /** Fisher–Yates shuffle (in place) using this stream. */
  shuffle<T>(items: T[]): T[]
  /** A short random base-36 token of the given length. */
  token(length: number): string
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1))
  const shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = int(0, i)
      ;[items[i], items[j]] = [items[j]!, items[i]!]
    }
    return items
  }
  const token = (length: number): string => {
    let out = ''
    while (out.length < length) out += next().toString(36).slice(2)
    return out.slice(0, length)
  }
  return { next, int, shuffle, token }
}
