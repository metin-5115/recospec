import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**', 'benchmarks/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**'],
      exclude: [
        // test infrastructure
        'src/test-setup.ts',
        'src/vite-env.d.ts',
        // type-only files (no executable code)
        'src/shared/types/**',
        // entry points (bootstrapping only)
        'src/popup/popup.tsx',
        'src/side-panel/side-panel.tsx',
        // Chrome-API-dependent files (unit-testable only via E2E)
        'src/background/**',
        'src/content/index.ts',
        'src/content/event-capture.ts',
        'src/content/element-probe.ts',
        'src/shared/messaging/**',
        'src/shared/logger.ts',
        // UI components without unit tests (covered via E2E in later phases)
        'src/popup/PopupApp.tsx',
        'src/side-panel/SidePanelApp.tsx',
        'src/side-panel/sessionStore.ts',
        'src/side-panel/hooks/**',
        'src/side-panel/components/CodePreview.tsx',
        'src/side-panel/components/ErrorBoundary.tsx',
        'src/side-panel/components/SessionList.tsx',
        'src/side-panel/components/StepList.tsx',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
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
