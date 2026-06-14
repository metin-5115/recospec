/**
 * Helpers for asserting DYNAMIC element values (price / date / count). The
 * exact text changes every run, so instead of `toHaveText("₺54.300")` we offer
 * a shape-matching regex or a stable-substring "contains" — these survive the
 * value changing while still verifying the value is present and well-formed.
 */

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g

/**
 * Derive a loose regex *source* that matches the SHAPE of a dynamic value:
 * literal characters are escaped, digit runs become `\d+`, and whitespace runs
 * become `\s+`. e.g. `"₺54.300 / 4 gece"` → `"₺\d+\.\d+\s+/\s+\d+\s+gece"`.
 * The result is an editable default the user can tighten or loosen.
 */
export function suggestedPattern(value: string): string {
  return value
    .trim()
    .replace(REGEX_SPECIALS, '\\$&')
    .replace(/\d+/g, '\\d+')
    .replace(/[^\S\r\n]+/g, '\\s+')
}

/**
 * The longest letter-run in a value — a stable unit/currency word like `TL`,
 * `gece`, or a month name — usable as a `contains` default. Returns `''` when
 * the value is purely numeric/symbolic (then no contains suggestion is offered).
 */
export function stableSubstring(value: string): string {
  const words = value.match(/[\p{L}]{2,}/gu) ?? []
  let best = ''
  for (const w of words) if (w.length > best.length) best = w
  return best
}
