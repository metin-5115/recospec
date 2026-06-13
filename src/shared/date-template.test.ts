import { describe, it, expect } from 'vitest'
import { inferDateTemplate, dateFnsLocaleImportName } from './date-template'

describe('inferDateTemplate — TR/EN/DE round-trip', () => {
  it('parses a Turkish datepicker cell label', () => {
    const t = inferDateTemplate('12 Ağustos 2026 Çarşamba')
    expect(t).not.toBeNull()
    expect(t!.pattern).toBe('d MMMM yyyy EEEE')
    expect(t!.localeId).toBe('tr')
    expect(t!.iso).toBe('2026-08-12')
  })

  it('parses a US-English long date', () => {
    const t = inferDateTemplate('August 12, 2026')
    expect(t).not.toBeNull()
    expect(t!.pattern).toBe('MMMM d, yyyy')
    expect(t!.localeId).toBe('en-US')
    expect(t!.iso).toBe('2026-08-12')
  })

  it('parses a British day-first date', () => {
    const t = inferDateTemplate('12 August 2026')
    expect(t).not.toBeNull()
    expect(t!.pattern).toBe('d MMMM yyyy')
    expect(t!.iso).toBe('2026-08-12')
  })

  it('parses a German dotted long date', () => {
    // "August" is the same word in English and German — without a document
    // language the locale is ambiguous, so only pattern + iso are asserted.
    const t = inferDateTemplate('12. August 2026')
    expect(t).not.toBeNull()
    expect(t!.pattern).toBe('d. MMMM yyyy')
    expect(t!.iso).toBe('2026-08-12')
    // With a locale allowlist the ambiguity resolves to German.
    expect(inferDateTemplate('12. August 2026', ['de'])!.localeId).toBe('de')
  })

  it('parses German numeric dd.MM.yyyy', () => {
    const t = inferDateTemplate('12.08.2026')
    expect(t).not.toBeNull()
    expect(t!.pattern).toBe('dd.MM.yyyy')
    expect(t!.iso).toBe('2026-08-12')
  })

  it('parses a year-less Turkish cell label against the pinned reference year', () => {
    const t = inferDateTemplate('12 Ağustos')
    expect(t).not.toBeNull()
    expect(t!.pattern).toBe('d MMMM')
    expect(t!.localeId).toBe('tr')
  })

  it('rejects non-dates and fantasy months', () => {
    expect(inferDateTemplate('Hello world')).toBeNull()
    expect(inferDateTemplate('12 Foobar 2026')).toBeNull()
    expect(inferDateTemplate('')).toBeNull()
    expect(inferDateTemplate('Sign in')).toBeNull()
  })

  it('honours an explicit locale allowlist', () => {
    expect(inferDateTemplate('12 Ağustos 2026', ['de'])).toBeNull()
    expect(inferDateTemplate('12 Ağustos 2026', ['tr'])).not.toBeNull()
  })
})

describe('dateFnsLocaleImportName', () => {
  it('maps locale ids to date-fns export names', () => {
    expect(dateFnsLocaleImportName('tr')).toBe('tr')
    expect(dateFnsLocaleImportName('en-US')).toBe('enUS')
    expect(dateFnsLocaleImportName('en-GB')).toBe('enGB')
    expect(dateFnsLocaleImportName('de')).toBe('de')
    expect(dateFnsLocaleImportName('xx')).toBe('enUS')
  })
})
