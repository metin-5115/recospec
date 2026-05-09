import { MAX_DYNAMIC_ID_ENTROPY, MIN_DYNAMIC_ID_DIGIT_SUFFIX } from '@shared/constants'

const NUMERIC_SUFFIX_PATTERN = new RegExp(`-\\d{${MIN_DYNAMIC_ID_DIGIT_SUFFIX},}(-\\d+)*$`)

const DYNAMIC_CLASS_PATTERNS = [
  /^css-[a-z0-9]+$/i,
  /^jss[0-9]+$/,
  /^sc-[a-z0-9]{6,}$/i,
  /^Mui[A-Z]/,
  /^makeStyles-/,
  /^[a-zA-Z]+-[0-9a-f]{5,}$/,
]

const DYNAMIC_ID_PATTERNS = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^css-[a-z0-9]+$/i,
  /^ember[0-9]+$/,
  /^:[a-z][a-z0-9]*:?$/,
]

function shannonEntropy(str: string): number {
  const freq: Record<string, number> = {}
  for (const c of str) freq[c] = (freq[c] ?? 0) + 1
  let h = 0
  for (const count of Object.values(freq)) {
    const p = count / str.length
    h -= p * Math.log2(p)
  }
  return h
}

export function isDynamicClass(cls: string): boolean {
  if (DYNAMIC_CLASS_PATTERNS.some((p) => p.test(cls))) return true
  return cls.length > 8 && shannonEntropy(cls) > MAX_DYNAMIC_ID_ENTROPY
}

export function isDynamicId(id: string): boolean {
  if (DYNAMIC_ID_PATTERNS.some((p) => p.test(id))) return true
  if (NUMERIC_SUFFIX_PATTERN.test(id)) return true
  if (/^\d+$/.test(id)) return true
  return id.length > 10 && shannonEntropy(id) > MAX_DYNAMIC_ID_ENTROPY
}
