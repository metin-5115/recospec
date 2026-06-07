// Build the Recospec VS Code extension VSIX.
//
// We invoke `@vscode/vsce` programmatically (via its CLI binary) rather than
// running `cd vscode-extension && vsce package` so the script works the same
// way on cmd.exe, PowerShell, and bash and so the output filename can be
// pinned to `releases/recospec-<version>.vsix` without depending on shell
// argument escaping. The VSIX itself is committed to `releases/` so a tagged
// release is reproducible without re-running the toolchain.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const extensionDir = resolve(repoRoot, 'vscode-extension')
const releasesDir = resolve(repoRoot, 'releases')

const pkg = JSON.parse(readFileSync(resolve(extensionDir, 'package.json'), 'utf8'))
const outFile = resolve(releasesDir, `${pkg.name}-${pkg.version}.vsix`)

if (!existsSync(resolve(extensionDir, 'dist', 'extension.cjs'))) {
  // eslint-disable-next-line no-console
  console.error('[recospec] dist/extension.cjs missing — run `pnpm build:vscode` first.')
  process.exit(1)
}
if (!existsSync(resolve(extensionDir, 'chrome-ext', 'manifest.json'))) {
  // eslint-disable-next-line no-console
  console.error(
    '[recospec] chrome-ext/manifest.json missing — run `pnpm build && pnpm build:vscode` so ' +
      'the Chrome extension is mirrored next to the VS Code extension.',
  )
  process.exit(1)
}

mkdirSync(releasesDir, { recursive: true })

const vsceBin = resolve(
  repoRoot,
  'node_modules',
  '@vscode',
  'vsce',
  'vsce',
)

const result = spawnSync(
  process.execPath,
  [
    vsceBin,
    'package',
    '--no-dependencies',
    '--no-yarn',
    '--out',
    outFile,
  ],
  {
    cwd: extensionDir,
    stdio: 'inherit',
  },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

// eslint-disable-next-line no-console
console.log(`[recospec] packaged → ${outFile}`)
