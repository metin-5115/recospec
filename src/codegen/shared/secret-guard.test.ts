import { describe, it, expect } from 'vitest'
import { assertNoSecretValues, SecretLeakError } from './secret-guard'

describe('assertNoSecretValues', () => {
  it('throws, without naming the value, when a secret is written as a quoted value', () => {
    const attempt = () =>
      assertNoSecretValues('When I log in with "hunter2-long"', ['hunter2-long'], 'feature file')
    expect(attempt).toThrow(SecretLeakError)
    try {
      attempt()
    } catch (error) {
      expect(String(error)).not.toContain('hunter2-long')
    }
  })

  it('accepts references and ignores values too short to scan for', () => {
    expect(() =>
      assertNoSecretValues(
        'When I log in with "$RECOSPEC_PASSWORD" and "ab"',
        ['hunter2-long', 'ab'],
        'feature file',
      ),
    ).not.toThrow()
  })
})
