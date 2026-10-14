import { describe, it, expect } from 'vitest'
import { slugifyFilename, slugifyKebab } from './slug'

describe('slugifyFilename', () => {
  it('replaces whitespace with underscores', () => {
    expect(slugifyFilename('Login  flow')).toBe('Login_flow')
  })

  it('drops characters outside word chars and hyphen', () => {
    expect(slugifyFilename('a/b:c?.json')).toBe('abcjson')
  })

  it('returns empty string when nothing survives', () => {
    expect(slugifyFilename('???')).toBe('')
  })
})

describe('slugifyKebab', () => {
  it('lowercases and joins runs of non-alphanumerics with a single hyphen', () => {
    expect(slugifyKebab('  Hero  Banner!! ', 'x')).toBe('hero-banner')
  })

  it('uses the fallback when the title has no ASCII alphanumerics', () => {
    expect(slugifyKebab('日本語', 'snapshot')).toBe('snapshot')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugifyKebab('--a--', 'x')).toBe('a')
  })
})
