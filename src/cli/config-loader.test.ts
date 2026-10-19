import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRc, RC_FILENAME } from './config-loader'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'recospec-rc-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('loadRc', () => {
  it('returns null when no rc file exists', () => {
    expect(loadRc(tmp)).toBeNull()
  })

  it('parses a well-formed rc and returns the absolute source path', () => {
    const rc = { version: 1, framework: 'playwright-ts', bdd: true }
    writeFileSync(join(tmp, RC_FILENAME), JSON.stringify(rc), 'utf8')
    const loaded = loadRc(tmp)
    expect(loaded).not.toBeNull()
    expect(loaded?.config).toEqual(rc)
    expect(loaded?.source).toMatch(/\.recospecrc\.json$/)
  })

  it('keeps the configured output folders', () => {
    const paths = { pagesDir: 'e2e/po', testsDir: 'e2e/specs', featuresDir: 'e2e/bdd' }
    writeFileSync(join(tmp, RC_FILENAME), JSON.stringify({ version: 1, paths }), 'utf8')
    expect(loadRc(tmp)?.config.paths).toEqual(paths)
  })

  it('drops path settings that are not strings and unknown keys', () => {
    const paths = { pagesDir: 7, testsDir: 'e2e', featuresDir: null, scaffoldDir: 'x' }
    writeFileSync(join(tmp, RC_FILENAME), JSON.stringify({ paths }), 'utf8')
    expect(loadRc(tmp)?.config.paths).toEqual({ testsDir: 'e2e' })
  })

  it('ignores a paths value that is not an object', () => {
    writeFileSync(join(tmp, RC_FILENAME), JSON.stringify({ paths: 'tests' }), 'utf8')
    expect(loadRc(tmp)?.config.paths).toBeUndefined()
  })

  it('returns null for malformed JSON (caller logs)', () => {
    writeFileSync(join(tmp, RC_FILENAME), '{not valid', 'utf8')
    expect(loadRc(tmp)).toBeNull()
  })
})
