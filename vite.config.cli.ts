import { defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'path'

// The published package (`cli/package.json`) is the source of truth for `recospec --version`.
const cliPackage = JSON.parse(readFileSync(resolve(__dirname, 'cli/package.json'), 'utf8')) as {
  version: string
}

/**
 * Build config for the CLI bundle (`pnpm build:cli`).
 *
 * The CLI is a single ESM Node bundle written to `dist/cli/index.js`. Our own
 * code (`@codegen/*`, `@shared/*`) is inlined; npm dependencies (Babel,
 * commander, prompts, gherkin) stay external and are declared in
 * `cli/package.json` — `scripts/package-cli.mjs` verifies that. The
 * `#!/usr/bin/env node` shebang is preserved via the `banner` option.
 *
 * `dexie`, `react`, and Chrome APIs are NOT imported from this entrypoint
 * (the CLI uses only `@codegen/*` + `@shared/*`), so they get tree-shaken.
 *
 * `stripShebang` removes the shebang from the source file during the
 * transform phase — otherwise esbuild rejects the `#!` in module position,
 * and we add it back exactly once via Rollup's `banner` option.
 */
const stripShebang = (): Plugin => ({
  name: 'recospec:strip-shebang',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/cli/index.ts') && !id.endsWith('\\cli\\index.ts')) return null
    if (!code.startsWith('#!')) return null
    const newline = code.indexOf('\n')
    return newline === -1 ? '' : code.slice(newline + 1)
  },
})

export default defineConfig({
  plugins: [stripShebang()],
  define: { __CLI_VERSION__: JSON.stringify(cliPackage.version) },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@locator': resolve(__dirname, 'src/locator-engine'),
      '@codegen': resolve(__dirname, 'src/codegen'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@storage': resolve(__dirname, 'src/storage'),
    },
  },
  build: {
    target: 'node20',
    ssr: true,
    outDir: 'dist/cli',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/cli/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
  },
  ssr: {
    // Keep deps external — they are installed alongside the published `recospec` package.
    noExternal: [],
  },
})
