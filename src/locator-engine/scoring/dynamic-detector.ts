import { MAX_DYNAMIC_ID_ENTROPY, MIN_DYNAMIC_ID_DIGIT_SUFFIX } from '@shared/constants'

const NUMERIC_SUFFIX_PATTERN = new RegExp(`-\\d{${MIN_DYNAMIC_ID_DIGIT_SUFFIX},}(-\\d+)*$`)

const DYNAMIC_CLASS_PATTERNS = [
  /^css-[a-z0-9]+$/i,
  /^jss[0-9]+$/,
  /^sc-[a-z0-9]{6,}$/i,
  /^Mui[A-Z]/,
  /^makeStyles-/,
  /^[a-zA-Z]+-[0-9a-f]{5,}$/,

  // Emotion's styled-component class: `e1ie3l1u0` (e + digit + base36 + digit).
  /^e[0-9][a-z0-9]{5,8}[0-9]$/,

  // Angular: view-encapsulation markers (`ng-tns-c12-3`, `_ngcontent-abc-c12`,
  // `_nghost-abc-c12`) and form-state classes that flip while the user types.
  /^ng-tns-c[0-9]+-[0-9]+$/,
  /^_ng(content|host)-/,
  /^ng-(dirty|pristine|touched|untouched|valid|invalid|pending)$/,

  // Svelte scoped styles: `svelte-1x7k2ab` — base36 hash, always carries a digit.
  /^svelte-[a-z0-9]*[0-9][a-z0-9]*$/,
]

/**
 * CSS Modules: `[file]_[local]__[hash]` (`Button_primary__3xZ2a`). The hash must
 * carry a digit or mixed case, otherwise hand-written `block_mod__elem` BEM-ish
 * names would be misread as generated.
 */
const CSS_MODULE_PATTERN = /^[A-Za-z0-9-]+_[A-Za-z0-9-]+__([A-Za-z0-9_-]{5,8})$/

/**
 * Folder-prefixed CSS Modules: `[folder]__[file]_[local]__[hash]`
 * (`hm__style_dropdown__3tpXH`, `hm__grid_col-12__A_EnK`). Two `__` separators with the
 * hash after the last one; the base64 hash may itself end in `_` or `-`. A hand-written
 * BEM chain (`react-calendar__month-view__days__day`) ends in a plain word, which the
 * digit-or-mixed-case rule on the hash rejects.
 */
const FOLDER_CSS_MODULE_PATTERN = /^[A-Za-z0-9-]+__[A-Za-z0-9_-]+__([A-Za-z0-9_-]{5,8})$/

/** A hash is generated when it carries a digit or mixes cases; plain lowercase is a word. */
function looksLikeClassHash(hash: string): boolean {
  return /[0-9]/.test(hash) || (/[a-z]/.test(hash) && /[A-Z]/.test(hash))
}

export function isCssModuleClass(cls: string): boolean {
  const hash = (CSS_MODULE_PATTERN.exec(cls) ?? FOLDER_CSS_MODULE_PATTERN.exec(cls))?.[1]
  return hash !== undefined && looksLikeClassHash(hash)
}

/**
 * BEM modifiers toggled by the pointer or keyboard focus (`tile--hover`, `item--focused`). The
 * recorder captures them because the pointer is over the element at record time; a locator built
 * on one fails as soon as the pointer moves. `--active` / `--selected` are deliberately absent:
 * authors use them for durable state as often as for transient state.
 */
const POINTER_STATE_MODIFIER = /--(hover(-?(start|end))?|focus(ed|-visible|-within)?)$/i

export function isPointerStateClass(cls: string): boolean {
  return POINTER_STATE_MODIFIER.test(cls)
}

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

  // Compound BootstrapVue tab/pane ids like
  // `__BVID__27___BV_tab_button__` — multiple framework prefixes joined
  // and trailing with `__` (no digits at the end), so the patterns above
  // miss them. Three-or-more consecutive underscores anywhere are a
  // strong signal that the id is framework-generated; semantic snake_case
  // never reaches that depth.
  /___/,
]

/**
 * Substring markers that unambiguously identify a framework-generated id.
 * Checked as a plain `includes()` so the marker can sit anywhere in the id
 * (start, middle, or end). Keep this list conservative — every entry must
 * be specific enough that no real product would adopt it as a semantic id.
 */
const FRAMEWORK_ID_MARKERS = [
  'BVID', // Bootstrap Vue
  '_BV_', // Bootstrap Vue tab/tooltip/dropdown internals
]

export function shannonEntropy(str: string): number {
  const freq: Record<string, number> = {}
  for (const c of str) freq[c] = (freq[c] ?? 0) + 1
  let h = 0
  for (const count of Object.values(freq)) {
    const p = count / str.length
    h -= p * Math.log2(p)
  }
  return h
}

/**
 * The entropy heuristic catches single-token random hashes (`xQ9mZ2kPvRtYwNsA`).
 * It must NOT fire on multi-word kebab/snake identifiers (`map-canvas-overlay`,
 * `checkout-summary`): those are human-authored and only look "high entropy"
 * because they pack many distinct letters. Framework hashes that DO use a
 * separator (`css-1a2b3c`, `sc-bdVaJa`, `mat-input-3`) are already caught by the
 * explicit patterns above, so excluding separated names here loses no coverage.
 */
function looksLikeRandomHash(value: string, minLength: number): boolean {
  if (value.includes('-') || value.includes('_')) return false
  return value.length > minLength && shannonEntropy(value) > MAX_DYNAMIC_ID_ENTROPY
}

export function isDynamicClass(cls: string): boolean {
  if (DYNAMIC_CLASS_PATTERNS.some((p) => p.test(cls))) return true
  if (isCssModuleClass(cls) || isPointerStateClass(cls)) return true
  return looksLikeRandomHash(cls, 8)
}

export function isDynamicId(id: string): boolean {
  if (FRAMEWORK_ID_MARKERS.some((marker) => id.includes(marker))) return true
  if (DYNAMIC_ID_PATTERNS.some((p) => p.test(id))) return true
  if (NUMERIC_SUFFIX_PATTERN.test(id)) return true
  if (/^\d+$/.test(id)) return true
  return looksLikeRandomHash(id, 10)
}
