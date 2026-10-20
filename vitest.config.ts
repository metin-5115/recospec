import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Tests that touch the DOM run in jsdom; everything else (codegen, CLI, storage,
// pure shared modules) runs in node, which skips ~10 ms of jsdom setup per file.
// A new test that needs a DOM belongs under one of these globs.
//
// Isolation (a fresh module graph per file) is the dominant cost of the suite, so
// the `node` and `dom` projects run on shared worker threads. React component tests
// stay in their own `ui` project with a fresh process per file: several components
// leave timers running past the test, which only surfaces once workers are reused.
const UI_TEST_GLOBS = ['src/side-panel/**', 'src/popup/**', 'src/shared/hooks/**']

// Tests that open the IndexedDB database share one global (`fake-indexeddb/auto`) and one Dexie
// singleton. On the shared worker threads below they would see each other's rows, so they run
// in their own project with a fresh process per file. A new test that imports `@storage/*`
// or `fake-indexeddb` outside the UI globs belongs in this list.
const IDB_TESTS = [
  'src/background/assertion-handler.test.ts',
  'src/background/event-aggregator.test.ts',
  'src/background/export-handler.test.ts',
  'src/background/iteration-controller.test.ts',
  'src/background/replay-controller.test.ts',
  'src/background/session-manager.test.ts',
  'src/background/step-controller.test.ts',
  'src/codegen/final-assertion-pipeline.test.ts',
  'src/codegen/index.test.ts',
  'src/codegen/interactions-pipeline.test.ts',
  'src/codegen/keyboard-hover-pipeline.test.ts',
  'src/codegen/negative-flow-pipeline.test.ts',
  'src/codegen/syntax-smoke.test.ts',
  'src/codegen/upload-pipeline.test.ts',
  'src/storage/action-repo-ordering.test.ts',
  'src/storage/action-repo.test.ts',
  'src/storage/session-repo.test.ts',
  'src/storage/session-versioning.test.ts',
]

const DOM_TEST_GLOBS = [
  'src/content/**',
  'src/locator-engine/**',
  ...UI_TEST_GLOBS,
  'benchmarks/**',
  'test-harness/**',
  // Pure module, but its round-trip tests parse real HTML via DOMParser.
  'src/shared/selector-escape.test.ts',
  // Evaluates generated XPath against a real document.
  'src/codegen/shared/locator-value.test.ts',
]

const toTestGlob = (glob: string): string =>
  glob.endsWith('.test.ts') ? glob : `${glob}/*.test.{ts,tsx}`

// Benchmarks run in their own project so `pnpm test` / `pnpm test:ci` skip them
// (CI runs them separately via `pnpm bench`). The latency budget in
// performance.test.ts is wall-clock based and flaky under parallel load, and the
// survival benchmark is a long mutation sweep — neither belongs in the unit suite.
const BENCH_TESTS = ['benchmarks/survival.test.ts', 'benchmarks/performance.test.ts']

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
          pool: 'threads',
          exclude: [...BASE_EXCLUDE, ...DOM_TEST_GLOBS, ...IDB_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'idb',
          pool: 'forks',
          include: IDB_TESTS,
          exclude: BASE_EXCLUDE,
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          pool: 'threads',
          environment: 'jsdom',
          include: DOM_TEST_GLOBS.filter((g) => !UI_TEST_GLOBS.includes(g)).map(toTestGlob),
          exclude: [...BASE_EXCLUDE, ...BENCH_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          pool: 'forks',
          environment: 'jsdom',
          include: UI_TEST_GLOBS.map(toTestGlob),
          exclude: BASE_EXCLUDE,
        },
      },
      {
        extends: true,
        test: {
          name: 'bench',
          environment: 'jsdom',
          include: BENCH_TESTS,
        },
      },
    ],
    // `isolate` only takes effect per pool, not per project: a project chooses its pool.
    poolOptions: {
      threads: { isolate: false },
      forks: { isolate: true },
    },
    setupFiles: ['./src/test-setup.ts'],
    exclude: BASE_EXCLUDE,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**'],
      exclude: [
        // test infrastructure
        'src/test-setup.ts',
        'src/test-utils/**',
        '**/*.test-util.ts',
        'src/vite-env.d.ts',
        // type-only files (no executable code)
        'src/shared/types/**',
        // entry points that only wire modules together
        'src/popup/popup.tsx',
        'src/side-panel/side-panel.tsx',
        'src/background/index.ts',
        'src/content/index.ts',
        // VS Code extension host (requires the `vscode` runtime + a real editor;
        // exercised via the extension host, not jsdom unit tests)
        'src/vscode-ext/**',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
        // CLAUDE.md targets: the two modules the product's promise rests on are held to 85%.
        'src/locator-engine/**': { lines: 85, functions: 85, branches: 85, statements: 85 },
        'src/codegen/**': { lines: 85, functions: 85, branches: 85, statements: 85 },
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
