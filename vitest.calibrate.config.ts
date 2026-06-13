import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * Standalone config for the opt-in weight calibration grid search. The base
 * config EXCLUDES `benchmarks/calibrate.test.ts`; this one targets it directly.
 * Defined standalone (not via mergeConfig) because Vitest concatenates `exclude`
 * arrays on merge, which would re-exclude the very file we want to run.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['benchmarks/calibrate.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@locator': resolve(__dirname, 'src/locator-engine'),
      '@codegen': resolve(__dirname, 'src/codegen'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@storage': resolve(__dirname, 'src/storage'),
    },
  },
})
