import { describe, it, expect } from 'vitest'
import { runSurvival, preparedTargetCount } from './survival'
import { formatReport } from './report-format'
import { CORPUS } from './corpus'

/**
 * CI gate + bench report. Prints the full breakdown matrix and fails the
 * pipeline if mutation survival drops below threshold — this is what
 * `pnpm bench` runs.
 */
const PRIMARY_THRESHOLD = 0.85
const BUNDLE_THRESHOLD = 0.85

describe('mutation-survival benchmark', () => {
  it('corpus has ≥10 distinct scenarios', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(10)
  })

  it('engine builds a bundle for ≥10 recorded targets', () => {
    expect(preparedTargetCount()).toBeGreaterThanOrEqual(10)
  })

  it(`primarySurvival ≥ ${PRIMARY_THRESHOLD * 100}% and bundleSurvival ≥ ${BUNDLE_THRESHOLD * 100}%`, () => {
    const report = runSurvival()
    // eslint-disable-next-line no-console
    console.log('\n' + formatReport(report))
    expect(report.primarySurvival).toBeGreaterThanOrEqual(PRIMARY_THRESHOLD)
    expect(report.bundleSurvival).toBeGreaterThanOrEqual(BUNDLE_THRESHOLD)
  })

  it('is deterministic across runs with the same seed', () => {
    const a = runSurvival({ seed: 123 })
    const b = runSurvival({ seed: 123 })
    expect(a.primarySurvival).toBe(b.primarySurvival)
    expect(a.bundleSurvival).toBe(b.bundleSurvival)
  })
})
