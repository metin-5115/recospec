// Fails when a build artifact grows past its size budget.
// Usage: node scripts/check-bundle-size.mjs [--root <repo>] [--only chrome|cli|vscode]
//
// Run it after `pnpm build`, `pnpm build:vscode` and `pnpm build:cli` (in that order: the
// Chrome build wipes dist/, and the VS Code build mirrors dist/ into its package).
// Sizes use kB = 1000 bytes, like Vite's build report.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const KB = 1000

/**
 * Budgets in bytes.
 * - chrome.gzipTotal: the v1.0 "total JS < 500 KB" goal, measured as shipped (compressed).
 * - chrome.rawTotal: regression ceiling on uncompressed JS across every chunk, lazy ones included.
 *   Raw JS is ~880 KB today, so the 500 KB goal is not reachable uncompressed; lower this as
 *   the bundle shrinks.
 * - cli.raw: README budget for dist/cli/index.js.
 * - vscode.activation: the file VS Code parses on every activation (merge engines load lazily).
 */
export const BUDGETS = {
  chrome: { gzipTotal: 500 * KB, rawTotal: 900 * KB },
  cli: { raw: 250 * KB },
  vscode: { activation: 400 * KB },
}

function listFiles(dir, accept, skipDir = () => false) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skipDir(full)) found.push(...listFiles(full, accept, skipDir))
    } else if (accept(entry.name)) {
      found.push(full)
    }
  }
  return found
}

/** Sum of raw and gzip bytes for the Chrome extension's JS (dist/cli is a separate artifact). */
export function measureChrome(root) {
  const dist = resolve(root, 'dist')
  if (!existsSync(dist)) return null
  const cliDir = join(dist, 'cli')
  const files = listFiles(
    dist,
    (name) => name.endsWith('.js'),
    (dir) => dir === cliDir,
  )
  let raw = 0
  let gzip = 0
  for (const file of files) {
    const content = readFileSync(file)
    raw += content.length
    gzip += gzipSync(content, { level: 9 }).length
  }
  return { files: files.length, raw, gzip }
}

function fileSize(path) {
  return existsSync(path) ? statSync(path).size : null
}

const fmt = (bytes) => `${(bytes / KB).toFixed(1)} kB`

/** Returns one row per budget line: { label, actual, limit, ok, missing }. */
export function evaluate(root, only) {
  const rows = []
  const want = (name) => !only || only === name
  const push = (label, actual, limit) =>
    rows.push({
      label,
      actual,
      limit,
      missing: actual === null,
      ok: actual !== null && actual <= limit,
    })

  if (want('chrome')) {
    const chrome = measureChrome(root)
    push('Chrome extension JS, gzip total (dist/)', chrome?.gzip ?? null, BUDGETS.chrome.gzipTotal)
    push('Chrome extension JS, raw total (dist/)', chrome?.raw ?? null, BUDGETS.chrome.rawTotal)
  }
  if (want('cli')) {
    push(
      'CLI bundle (dist/cli/index.js)',
      fileSize(resolve(root, 'dist/cli/index.js')),
      BUDGETS.cli.raw,
    )
  }
  if (want('vscode')) {
    push(
      'VS Code activation bundle (extension.cjs)',
      fileSize(resolve(root, 'vscode-extension/dist/extension.cjs')),
      BUDGETS.vscode.activation,
    )
  }
  return rows
}

function main() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const i = args.indexOf(flag)
    return i === -1 ? undefined : args[i + 1]
  }
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const root = resolve(valueOf('--root') ?? defaultRoot)
  const only = valueOf('--only')
  if (only && !['chrome', 'cli', 'vscode'].includes(only)) {
    console.error(`[recospec] --only expects chrome, cli or vscode (got "${only}")`)
    process.exit(2)
  }

  let failed = false
  for (const row of evaluate(root, only)) {
    if (row.missing) {
      failed = true
      console.error(`[recospec] MISSING  ${row.label} — build it first`)
    } else {
      failed ||= !row.ok
      const status = row.ok ? 'ok     ' : 'TOO BIG'
      console.log(
        `[recospec] ${status} ${row.label}: ${fmt(row.actual)} (budget ${fmt(row.limit)})`,
      )
    }
  }
  if (failed) process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
