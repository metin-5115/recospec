import { describe, it, expect } from 'vitest'
import { isDynamicValue } from './dynamic-value'

describe('isDynamicValue', () => {
  it('flags standalone numbers and prices', () => {
    expect(isDynamicValue('23')).toBe(true)
    expect(isDynamicValue('294.840')).toBe(true)
    expect(isDynamicValue('1.234,56')).toBe(true)
    expect(isDynamicValue('1 234 567')).toBe(true)
  })

  it('flags currency values', () => {
    expect(isDynamicValue('₺294.840')).toBe(true)
    expect(isDynamicValue('294.840 TRY')).toBe(true)
    expect(isDynamicValue('$1,299')).toBe(true)
  })

  it('flags percentages and times', () => {
    expect(isDynamicValue('%35')).toBe(true)
    expect(isDynamicValue('35%')).toBe(true)
    expect(isDynamicValue('08:52')).toBe(true)
    expect(isDynamicValue('14:30:00')).toBe(true)
  })

  it('flags dates (ISO, numeric, and month-name in TR/EN)', () => {
    expect(isDynamicValue('2026-09-16')).toBe(true)
    expect(isDynamicValue('16/09/2026')).toBe(true)
    expect(isDynamicValue('23 Eylül 2026 Çarşamba')).toBe(true)
    expect(isDynamicValue('16 Eyl 2026 - 23 Eyl 2026')).toBe(true)
    expect(isDynamicValue('September 23, 2026')).toBe(true)
  })

  it('keeps stable semantic labels even when they contain a digit', () => {
    expect(isDynamicValue('Submit')).toBe(false)
    expect(isDynamicValue('Sign In')).toBe(false)
    expect(isDynamicValue('Clear completed')).toBe(false)
    expect(isDynamicValue('Otel Ara')).toBe(false)
    expect(isDynamicValue('7 Gece Toplam Fiyat')).toBe(false)
    expect(isDynamicValue('Balayı Otelleri 2025')).toBe(false)
    expect(isDynamicValue('Concorde Aria Hotel')).toBe(false)
  })

  it('handles empty / nullish input', () => {
    expect(isDynamicValue('')).toBe(false)
    expect(isDynamicValue(null)).toBe(false)
    expect(isDynamicValue(undefined)).toBe(false)
    expect(isDynamicValue('   ')).toBe(false)
  })
})
