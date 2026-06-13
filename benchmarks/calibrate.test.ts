import { describe, it } from 'vitest'
import { calibrate, formatCalibration } from './calibrate'

/**
 * Weight calibration is opt-in (slow grid search). The base vitest config
 * EXCLUDES this file; it runs only under `vitest.calibrate.config.ts` via
 * `pnpm bench:calibrate`.
 */
describe('weight calibration', () => {
  it('reports a proposal (never writes weights.ts)', () => {
    const result = calibrate()
    // eslint-disable-next-line no-console
    console.log('\n' + formatCalibration(result))
  })
})
