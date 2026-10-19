import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error — plain ESM script without type declarations
import { BUDGETS, evaluate, measureChrome } from './check-bundle-size.mjs'

interface Row {
  label: string
  actual: number | null
  limit: number
  ok: boolean
  missing: boolean
}

const roots: string[] = []

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'recospec-size-'))
  roots.push(root)
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('check-bundle-size', () => {
  it('counts Chrome JS under dist/ but not the CLI bundle that shares the folder', () => {
    const root = fixture({
      'dist/assets/a.js': 'a'.repeat(1000),
      'dist/assets/style.css': 'c'.repeat(5000),
      'dist/cli/index.js': 'x'.repeat(9000),
    })
    expect(measureChrome(root)).toMatchObject({ files: 1, raw: 1000 })
  })

  it('passes artifacts that are inside every budget', () => {
    const root = fixture({
      'dist/assets/a.js': 'a'.repeat(1000),
      'dist/cli/index.js': 'x'.repeat(1000),
      'vscode-extension/dist/extension.cjs': 'v'.repeat(1000),
    })
    const rows = evaluate(root) as Row[]
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.ok)).toBe(true)
  })

  it('fails the CLI bundle once it passes its budget', () => {
    const root = fixture({ 'dist/cli/index.js': 'x'.repeat(BUDGETS.cli.raw + 1) })
    const [row] = evaluate(root, 'cli') as Row[]
    expect(row?.ok).toBe(false)
  })

  it('fails the VS Code activation bundle once it passes its budget', () => {
    const root = fixture({
      'vscode-extension/dist/extension.cjs': 'v'.repeat(BUDGETS.vscode.activation + 1),
    })
    const [row] = evaluate(root, 'vscode') as Row[]
    expect(row?.ok).toBe(false)
  })

  it('fails Chrome JS over the raw ceiling', () => {
    // Incompressible-ish payload so the raw check is the one that trips.
    const noise = Array.from({ length: BUDGETS.chrome.rawTotal + 1 }, (_, i) =>
      String.fromCharCode(33 + ((i * 7919) % 90)),
    ).join('')
    const root = fixture({ 'dist/assets/big.js': noise })
    const rows = evaluate(root, 'chrome') as Row[]
    expect(rows.find((r) => r.label.includes('raw'))?.ok).toBe(false)
  })

  it('reports a missing artifact as a failure instead of passing silently', () => {
    const [row] = evaluate(fixture({}), 'cli') as Row[]
    expect(row).toMatchObject({ missing: true, ok: false })
  })
})
