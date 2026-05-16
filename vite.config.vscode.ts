import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'
import { builtinModules } from 'node:module'
import { cpSync, existsSync, rmSync } from 'node:fs'

/**
 * Build config for the PlayForge VS Code extension (`pnpm build:vscode`).
 *
 * Output lands inside `vscode-extension/dist/extension.js` so the extension
 * directory is self-contained and can be packaged via `vsce package` from
 * that folder without dragging the rest of the repo along.
 *
 * `vscode` is the only declared external — VS Code provides the module at
 * activation time. Everything else (`commander`, `prompts`, `@babel/*`,
 * adapters, codegen pipeline) gets bundled so the extension does not need
 * a `node_modules` install on the host machine.
 *
 * Format is CommonJS because that is the documented baseline for VS Code
 * extension activation across all supported VS Code versions.
 */
const NODE_BUILTIN_EXTERNALS = [
  'vscode',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]

/**
 * Bundling Playwright is impractical — it carries native browser binaries
 * and a heavy test-runner surface. We mark it external; in dev mode the
 * VS Code extension resolves it from the repo's own `node_modules`, and a
 * future VSIX recipe (sprint 8) will ship it via a `node_modules` payload
 * or runtime npm install. The Chromium binary is downloaded once via
 * Playwright's standard install command — not bundled.
 */
const PLAYWRIGHT_EXTERNALS = [
  '@playwright/test',
  'playwright',
  'playwright-core',
  /^playwright-core\//,
  /^@playwright\//,
]

/**
 * After the VS Code bundle finishes, mirror the Chrome extension build
 * (`dist/`) into `vscode-extension/chrome-ext/` so the Record command can
 * launch Chromium with `--load-extension=<vscode-ext>/chrome-ext`. If
 * `dist/` is missing we warn loudly — the Record command will surface a
 * "Bundled Chrome extension missing" error at runtime.
 */
function copyChromeExt(): Plugin {
  return {
    name: 'playforge:copy-chrome-ext',
    apply: 'build',
    closeBundle() {
      const source = resolve(__dirname, 'dist')
      const target = resolve(__dirname, 'vscode-extension/chrome-ext')
      if (!existsSync(source)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[playforge] WARNING: ${source} does not exist. Run \`pnpm build\` ` +
            'before `pnpm build:vscode` so the Chrome extension is bundled ' +
            'alongside the VS Code extension.',
        )
        return
      }
      if (existsSync(target)) rmSync(target, { recursive: true, force: true })
      cpSync(source, target, { recursive: true })
      // eslint-disable-next-line no-console
      console.log(`[playforge] copied Chrome extension → ${target}`)
    },
  }
}

export default defineConfig({
  plugins: [copyChromeExt()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@locator': resolve(__dirname, 'src/locator-engine'),
      '@codegen': resolve(__dirname, 'src/codegen'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@storage': resolve(__dirname, 'src/storage'),
    },
  },
  // Vite copies `public/` (Chrome ext manifest) into outDir by default;
  // disable it so the VSIX dist stays scoped to the extension entry.
  publicDir: false,
  build: {
    target: 'node20',
    ssr: true,
    outDir: 'vscode-extension/dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/vscode-ext/extension.ts'),
      formats: ['cjs'],
      fileName: () => 'extension.cjs',
    },
    rollupOptions: {
      external: [...NODE_BUILTIN_EXTERNALS, ...PLAYWRIGHT_EXTERNALS],
      output: {
        format: 'cjs',
        exports: 'named',
        entryFileNames: 'extension.cjs',
      },
    },
  },
  ssr: {
    // Bundle everything except `vscode` and Node builtins so the extension
    // is single-file and the marketplace VSIX has no install step.
    noExternal: true,
  },
})
