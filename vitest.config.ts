import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Tests that touch the DOM run in jsdom; everything else (codegen, CLI, storage,
// pure shared modules) runs in node, which skips ~10 ms of jsdom setup per file.
// A new test that needs a DOM belongs under one of these globs.
const DOM_TEST_GLOBS = [
  'src/content/**',
  'src/locator-engine/**',
  'src/side-panel/**',
  'src/popup/**',
  'src/shared/hooks/**',
  'benchmarks/**',
  'test-harness/**',
  // Pure module, but its round-trip tests parse real HTML via DOMParser.
  'src/shared/selector-escape.test.ts',
  // Evaluates generated XPath against a real document.
  'src/codegen/shared/locator-value.test.ts',
]

const toTestGlob = (glob: string): string =>
  glob.endsWith('.test.ts') ? glob : `${glob}/*.test.{ts,tsx}`

// Mutation-survival benchmark: runs in its own project so `pnpm test:ci` can skip
// it (CI runs it separately via `pnpm bench`) while a plain `pnpm test` keeps it.
const SURVIVAL_BENCH = 'benchmarks/survival.test.ts'

const BASE_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  'tests/e2e/**',
  // Sibling git worktrees live under .claude/ and carry full copies of the suite.
  '.claude/**',
  // Slow grid search — opt-in via `pnpm bench:calibrate` (own config).
  'benchmarks/calibrate.test.ts',
]

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          exclude: [...BASE_EXCLUDE, ...DOM_TEST_GLOBS],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: DOM_TEST_GLOBS.map(toTestGlob),
          exclude: [...BASE_EXCLUDE, SURVIVAL_BENCH],
        },
      },
      {
        extends: true,
        test: {
          name: 'bench',
          environment: 'jsdom',
          include: [SURVIVAL_BENCH],
        },
      },
    ],
    setupFiles: ['./src/test-setup.ts'],
    exclude: BASE_EXCLUDE,
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
        // VS Code extension host (requires the `vscode` runtime + a real editor;
        // exercised via the extension host, not jsdom unit tests)
        'src/vscode-ext/**',
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
