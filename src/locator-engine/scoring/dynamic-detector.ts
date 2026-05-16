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

  // Framework-internal auto-generated IDs. These slip past the entropy
  // and digit-suffix checks because their digit tail is short and the
  // structural shape (underscore brackets, framework prefix) is what
  // makes them dynamic — not randomness.

  // Bootstrap Vue: `__BVID__517`, `__BV_tab__1`, `__BV_tooltip__42`.
  // Requires 2+ underscores on each side so semantic snake_case ids
  // (`user_id_1`, `_private_field_2`) stay untouched.
  /^_{2,}[A-Za-z][A-Za-z0-9_]*_{2,}\d+$/,

  // Angular Material / MDC / CDK: `mat-input-3`, `mdc-floating-label-12`,
  // `cdk-overlay-42`. Always `prefix-word(-word)*-digits`.
  /^(mat|mdc|cdk)-[a-z][a-z0-9-]*-\d+$/i,

  // Vuetify auto-generated: `v-input-3`, `v-menu-12`, `v-select-7`.
  // Hyphen-segmented word block required so `v-2` (manual semantic id) stays.
  /^v-[a-z]+(-[a-z]+)*-\d+$/,

  // jQuery UI: `ui-id-42`.
  /^ui-id-\d+$/,

  // Lit: `lit-1`, `lit-element-3`.
  /^lit(-element)?-\d+$/,

  // Generic catch-all: any prefix terminated by `__<digits>` regardless of
  // leading underscores. Catches `BVID__517` even when the host strips the
  // leading underscores during rendering (some Bootstrap Vue versions do).
  /^[A-Za-z][A-Za-z0-9_]*__\d+$/,
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
