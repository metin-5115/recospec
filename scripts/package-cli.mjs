// Build and pack the publishable `recospec` CLI package from `cli/`.
//
// The CLI bundle keeps its npm dependencies external, so this script verifies that every
// bare import in the bundle is declared in `cli/package.json` before packing — a missing
// dependency would otherwise only surface on a user's machine.
//
// `pnpm build` (Chrome extension) wipes `dist/`, so the CLI is always rebuilt here.

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cliDir = resolve(repoRoot, 'cli')
const releasesDir = resolve(repoRoot, 'releases')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(pnpm, ['build:cli'], repoRoot)

mkdirSync(resolve(cliDir, 'dist'), { recursive: true })
copyFileSync(resolve(repoRoot, 'dist/cli/index.js'), resolve(cliDir, 'dist/index.js'))
copyFileSync(resolve(repoRoot, 'LICENSE'), resolve(cliDir, 'LICENSE'))

const pkg = JSON.parse(readFileSync(resolve(cliDir, 'package.json'), 'utf8'))
const bundle = readFileSync(resolve(cliDir, 'dist/index.js'), 'utf8')
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])
// Only the leading import block counts: later `import ...` lines are template text for generated code.
const importBlock = []
for (const line of bundle.split(/\r?\n/)) {
  if (line.startsWith('#!') || line.trim() === '') continue
  if (!line.startsWith('import ')) break
  importBlock.push(line)
}
const imported = new Set(
  importBlock.map((line) => line.match(/["']([^"']+)["'];?\s*$/)?.[1]).filter(Boolean),
)
const packageName = (spec) =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
const missing = [...imported]
  .filter((spec) => !builtins.has(spec) && !spec.startsWith('.'))
  .map(packageName)
  .filter((name) => !(name in pkg.dependencies))
if (missing.length > 0) {
  console.error(
    `[recospec] bundle imports undeclared dependencies: ${[...new Set(missing)].join(', ')}`,
  )
  process.exit(1)
}

mkdirSync(releasesDir, { recursive: true })
run(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['pack', '--pack-destination', releasesDir],
  cliDir,
)
console.log(`[recospec] packed ${pkg.name}@${pkg.version} → ${releasesDir}`)
