import { inferDateTemplate } from './date-template'

/**
 * Multi-signal text classifier — the single authority on whether a piece of
 * visible text / accessible name is a stable semantic label, a data value
 * (date, price, count — parameterizable), or outright volatile (changes while
 * you watch it). Pure function: every DOM-derived signal arrives via `ctx`.
 *
 * Signal priority (strongest first, short-circuit):
 *  1. Structural template — N≥3 same-shaped siblings with differing text is a
 *     repeating data pattern (calendar days, product cards) in any language.
 *  2. Mutation — text that changed during the recording session (live price,
 *     countdown) is volatile, full stop.
 *  3. Value parse — Intl-derived number/currency parsing across the active +
 *     common locales, date reverse-parse, percent/time/ISO shapes, and a
 *     relative-date dictionary.
 *  4. Role context — an accessible name on button/link/menuitem/tab leans
 *     stable; bare text inside cell/listitem/option leans data.
 */

export type TextClass = 'stable-label' | 'data-value' | 'volatile'

export interface TextClassifyContext {
  /** ARIA role of the element carrying the text (explicit or implicit). */
  role?: string | null
  /** Count of same-fingerprint siblings with DIFFERENT text (structural template). */
  siblingTemplateCount?: number
  /** The element's text changed during the recording session. */
  mutated?: boolean
  /** BCP-47-ish locale of the page, e.g. `tr`, `en-US`. */
  locale?: string
}

/** Roles whose accessible name is authored UI copy — a strong stable signal. */
const STABLE_NAME_ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'heading'])

/** Roles that hold data content — a weak data-value signal. */
const DATA_CONTENT_ROLES = new Set(['cell', 'gridcell', 'listitem', 'option', 'row'])

/** Relative-date vocabulary (TR / EN / DE) checked word-wise. */
const RELATIVE_DATE_WORDS = new Set([
  // Turkish
  'dün',
  'bugün',
  'yarın',
  'önce',
  'sonra',
  'şimdi',
  // English
  'yesterday',
  'today',
  'tomorrow',
  'ago',
  'now',
  // German
  'gestern',
  'heute',
  'morgen',
  'vor',
  'jetzt',
])

const DEFAULT_LOCALES = ['tr', 'en-US', 'en-GB', 'de'] as const

interface NumberSeparators {
  group: string
  decimal: string
  currencies: RegExp
}

const SEPARATOR_CACHE = new Map<string, NumberSeparators>()

/**
 * Derive group/decimal separators from Intl.NumberFormat instead of
 * hard-coding per-locale regexes — the runtime knows its own CLDR data.
 */
function separatorsFor(locale: string): NumberSeparators {
  const cached = SEPARATOR_CACHE.get(locale)
  if (cached) return cached
  let group = ','
  let decimal = '.'
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567.89)
    group = parts.find((p) => p.type === 'group')?.value ?? group
    decimal = parts.find((p) => p.type === 'decimal')?.value ?? decimal
  } catch {
    /* unknown locale — keep defaults */
  }
  const result: NumberSeparators = {
    group,
    decimal,
    currencies: /[₺$€£¥]|(?:\b(?:try|usd|eur|gbp|chf|tl)\b)/i,
  }
  SEPARATOR_CACHE.set(locale, result)
  return result
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-string number/price parse attempt for one locale's separators. */
function parsesAsNumber(value: string, locale: string): boolean {
  const { group, decimal, currencies } = separatorsFor(locale)
  const stripped = value.replace(currencies, '').trim()
  if (!stripped || !/\d/.test(stripped)) return false
  const numericRe = new RegExp(
    `^[+-]?\\d{1,3}(?:${escapeRe(group)}\\d{3})*(?:${escapeRe(decimal)}\\d+)?$|^[+-]?\\d+(?:${escapeRe(decimal)}\\d+)?$`,
  )
  return numericRe.test(stripped)
}

const PERCENT_RE = /^%\s*\d+([.,]\d+)?$|^\d+([.,]\d+)?\s*%$/
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?(\s*[ap]m)?$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([t ]\d{2}:\d{2}(:\d{2})?.*)?$/i
const NUMERIC_DATE_RE = /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/

/** Month names (TR/EN/DE, full + abbreviations) for partial/range date detection. */
const MONTH_WORDS = new Set([
  'ocak',
  'şubat',
  'mart',
  'nisan',
  'mayıs',
  'haziran',
  'temmuz',
  'ağustos',
  'eylül',
  'ekim',
  'kasım',
  'aralık',
  'oca',
  'şub',
  'mar',
  'nis',
  'may',
  'haz',
  'tem',
  'ağu',
  'eyl',
  'eki',
  'kas',
  'ara',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'jan',
  'feb',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
  'januar',
  'februar',
  'märz',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'dezember',
  'okt',
  'dez',
])

function containsMonthWord(value: string): boolean {
  return value
    .toLowerCase()
    .split(/[\s\-/.,]+/)
    .some((w) => MONTH_WORDS.has(w))
}

function containsRelativeDateWord(value: string): boolean {
  const words = value.toLowerCase().split(/[\s,]+/)
  return words.some((w) => RELATIVE_DATE_WORDS.has(w))
}

/** Space-grouped numbers (fr/nordic "1 234 567") — JS `s` covers nbsp variants. */
const SPACE_GROUPED_NUMBER_RE = /^[+-]?\d{1,3}(?:\s\d{3})+(?:[.,]\d+)?$/

/** True when the whole (trimmed) string reads as a value in any candidate locale. */
function isParsableValue(value: string, locales: readonly string[]): boolean {
  if (PERCENT_RE.test(value)) return true
  if (TIME_RE.test(value)) return true
  if (ISO_DATE_RE.test(value)) return true
  if (NUMERIC_DATE_RE.test(value)) return true
  if (SPACE_GROUPED_NUMBER_RE.test(value)) return true
  for (const locale of locales) {
    if (parsesAsNumber(value, locale)) return true
  }
  if (inferDateTemplate(value) !== null) return true
  // Month-word fallback catches range/partial dates the strict round-trip
  // cannot ("16 Eyl 2026 - 23 Eyl 2026").
  if (/\d/.test(value) && containsMonthWord(value)) return true
  // Relative dates: "2 saat önce", "in 3 days", "vor 2 Tagen" carry a digit;
  // bare "dün"/"today"/"heute" do not.
  if (containsRelativeDateWord(value)) return true
  return false
}

export function classifyText(
  text: string | null | undefined,
  ctx: TextClassifyContext = {},
): TextClass {
  if (!text) return 'stable-label'
  const value = text.replace(/\s+/g, ' ').trim()
  if (!value) return 'stable-label'

  // 1 — structural template (language-agnostic repeating siblings).
  if ((ctx.siblingTemplateCount ?? 0) >= 3) return 'data-value'

  // 2 — observed mutation during the session.
  if (ctx.mutated) return 'volatile'

  // 3 — Intl/date value parse.
  const locales = ctx.locale ? [ctx.locale, ...DEFAULT_LOCALES] : [...DEFAULT_LOCALES]
  if (isParsableValue(value, locales)) return 'data-value'

  // 4 — role context.
  if (ctx.role && STABLE_NAME_ROLES.has(ctx.role)) return 'stable-label'
  if (ctx.role && DATA_CONTENT_ROLES.has(ctx.role) && /\d/.test(value)) return 'data-value'

  return 'stable-label'
}
