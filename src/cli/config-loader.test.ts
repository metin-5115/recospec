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

  it('returns null for malformed JSON (caller logs)', () => {
    writeFileSync(join(tmp, RC_FILENAME), '{not valid', 'utf8')
    expect(loadRc(tmp)).toBeNull()
  })
})
