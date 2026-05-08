import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { loadFixtures, evaluateFixture } from './runner'

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const SUCCESS_THRESHOLD = 0.8

describe('Locator benchmark fixtures', () => {
  const fixtures = loadFixtures(FIXTURES_DIR)

  it('discovers at least 5 fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5)
  })

  for (const fixture of fixtures) {
    it(`${fixture.name} achieves ≥${Math.round(SUCCESS_THRESHOLD * 100)}% success rate`, () => {
      const result = evaluateFixture(fixture)
      const failuresMessage = result.failures.map((f) => `  - ${f.entry}: ${f.reason}`).join('\n')
      expect(
        result.successRate,
        `${fixture.name} success ${(result.successRate * 100).toFixed(1)}% (${result.passed}/${result.total})\n${failuresMessage}`,
      ).toBeGreaterThanOrEqual(SUCCESS_THRESHOLD)
    })
  }
})
