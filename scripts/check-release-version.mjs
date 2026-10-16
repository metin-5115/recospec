// Fails when a release tag does not match every shipped package version.
// Usage: node scripts/check-release-version.mjs v0.7.0   (CI passes ${{ github.ref_name }})

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
if (!tag) {
  console.error('[recospec] usage: check-release-version.mjs <tag>')
  process.exit(2)
}
const expected = tag.replace(/^v/, '')

const SOURCES = [
  'package.json',
  'public/manifest.json',
  'cli/package.json',
  'vscode-extension/package.json',
]

const mismatches = SOURCES.map((file) => ({
  file,
  version: JSON.parse(readFileSync(resolve(repoRoot, file), 'utf8')).version,
})).filter(({ version }) => version !== expected)

if (mismatches.length > 0) {
  console.error(`[recospec] tag ${tag} expects version ${expected}, but:`)
  for (const { file, version } of mismatches) console.error(`  - ${file} is ${version}`)
  process.exit(1)
}
console.log(`[recospec] all ${SOURCES.length} package versions match ${tag}`)
