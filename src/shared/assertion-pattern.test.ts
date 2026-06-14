import { describe, it, expect } from 'vitest'
import { suggestedPattern, stableSubstring } from './assertion-pattern'

describe('suggestedPattern', () => {
  it('replaces digit runs with \\d+ and escapes literals', () => {
    expect(suggestedPattern('294.840')).toBe('\\d+\\.\\d+')
  })

  it('produces a shape regex for a currency value + unit', () => {
    expect(suggestedPattern('₺54.300 / 4 gece')).toBe('₺\\d+\\.\\d+\\s+/\\s+\\d+\\s+gece')
  })

  it('never embeds the literal digits', () => {
    expect(suggestedPattern('76.800 TL')).not.toContain('76')
  })

  it('the produced pattern actually matches a different value of the same shape', () => {
    const re = new RegExp(suggestedPattern('294.840 TRY'))
    expect(re.test('118.500 TRY')).toBe(true)
    expect(re.test('sold out')).toBe(false)
  })

  it('escapes regex metacharacters in literal parts', () => {
    // parentheses are escaped so the pattern stays valid
    expect(() => new RegExp(suggestedPattern('(12) 999'))).not.toThrow()
  })
})

describe('stableSubstring', () => {
  it('returns the longest letter word (a unit)', () => {
    expect(stableSubstring('294.840 TRY')).toBe('TRY')
    expect(stableSubstring('₺54.300 / 4 gece')).toBe('gece')
  })

  it('handles non-ASCII letters', () => {
    expect(stableSubstring('12 Ağustos 2026')).toBe('Ağustos')
  })

  it('returns empty string for purely numeric/symbolic values', () => {
    expect(stableSubstring('₺54.300')).toBe('')
    expect(stableSubstring('76.800')).toBe('')
  })
})
