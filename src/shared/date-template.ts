import { format, isValid, parse } from 'date-fns'
import { tr, enUS, enGB, de } from 'date-fns/locale'
import type { Locale } from 'date-fns'

/**
 * Reverse-parse a piece of visible text into a date-fns format template.
 *
 * A LIMITED pattern set × locale list is attempted; a candidate only wins by
 * full round-trip — `parse` succeeds AND `format(parsed, pattern)` reproduces
 * the original (whitespace-normalized) text exactly. No fuzzy matching: if
 * nothing round-trips, the caller falls back to a generic `{param:…}`
 * template instead of guessing.
 */

export interface DateTemplate {
  /** date-fns format pattern, e.g. `d MMMM yyyy EEEE`. */
  pattern: string
  /** Locale id (`tr`, `en-US`, `en-GB`, `de`). */
  localeId: string
  /** The parsed date. */
  date: Date
  /** ISO-8601 calendar date (yyyy-MM-dd). */
  iso: string
}

const LOCALES: ReadonlyArray<{ id: string; locale: Locale }> = [
  { id: 'tr', locale: tr },
  { id: 'en-US', locale: enUS },
  { id: 'en-GB', locale: enGB },
  { id: 'de', locale: de },
]

/**
 * 10–15 patterns covering the date renderings recorders actually meet:
 * datepicker cell labels, order timestamps, range endpoints. Order matters —
 * more specific patterns first so the round-trip picks the richest match.
 */
const PATTERNS: readonly string[] = [
  'd MMMM yyyy EEEE', // 12 Ağustos 2026 Çarşamba
  'EEEE, d MMMM yyyy', // Wednesday, August 12 2026 (comma via literal)
  'EEEE d MMMM yyyy',
  'MMMM d, yyyy', // August 12, 2026
  'd MMMM yyyy', // 12 Ağustos 2026
  'd. MMMM yyyy', // 12. August 2026 (de)
  'd MMM yyyy', // 12 Ağu 2026
  'MMM d, yyyy',
  'yyyy-MM-dd',
  'dd.MM.yyyy',
  'd.M.yyyy',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'd MMMM', // 12 Ağustos (year-less cell labels)
  'MMMM yyyy', // Ağustos 2026 (calendar headers)
]

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Reference date for year-less patterns — pinned so parsing is deterministic. */
const REFERENCE = new Date(2026, 0, 1)

export function inferDateTemplate(
  text: string,
  localeIds?: readonly string[],
): DateTemplate | null {
  const value = normalize(text)
  if (!value || !/\d/.test(value)) return null

  const locales = localeIds?.length ? LOCALES.filter((l) => localeIds.includes(l.id)) : LOCALES

  for (const pattern of PATTERNS) {
    for (const { id, locale } of locales) {
      let parsed: Date
      try {
        parsed = parse(value, pattern, REFERENCE, { locale })
      } catch {
        continue
      }
      if (!isValid(parsed)) continue
      let roundTrip: string
      try {
        roundTrip = format(parsed, pattern, { locale })
      } catch {
        continue
      }
      if (normalize(roundTrip) === value) {
        return { pattern, localeId: id, date: parsed, iso: format(parsed, 'yyyy-MM-dd') }
      }
    }
  }
  return null
}

/**
 * Locale ids matching a BCP-47 language tag — used to PREFER the document
 * language when a label is ambiguous across locales (e.g. "August" is the
 * same word in English and German).
 */
export function localeIdsForLang(lang: string): string[] {
  const norm = lang.trim().toLowerCase()
  if (!norm) return []
  return LOCALES.filter(
    (l) => l.id.toLowerCase() === norm || l.id.toLowerCase().startsWith(`${norm}-`),
  ).map((l) => l.id)
}

/** Resolve a locale id back to the date-fns Locale object (codegen helpers). */
export function dateFnsLocale(localeId: string): Locale {
  return LOCALES.find((l) => l.id === localeId)?.locale ?? enUS
}

/** Import-name of the date-fns locale export for generated code (`tr`, `enUS`, …). */
export function dateFnsLocaleImportName(localeId: string): string {
  switch (localeId) {
    case 'tr':
      return 'tr'
    case 'en-GB':
      return 'enGB'
    case 'de':
      return 'de'
    default:
      return 'enUS'
  }
}
