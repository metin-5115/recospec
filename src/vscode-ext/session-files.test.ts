import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureSessionsDirIgnored } from './session-files'

let root: string
let sessionsDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'recospec-sessions-'))
  sessionsDir = join(root, '.recospec', 'sessions')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('ensureSessionsDirIgnored', () => {
  it('creates the directory and a .gitignore that hides every recording in it', () => {
    expect(ensureSessionsDirIgnored(sessionsDir)).toBe(true)
    const content = readFileSync(join(sessionsDir, '.gitignore'), 'utf8')
    expect(content).toContain('*')
    expect(content.toLowerCase()).toContain('recospec')
  })

  it('does not touch the project root or its .gitignore', () => {
    writeFileSync(join(root, '.gitignore'), 'node_modules\n')
    ensureSessionsDirIgnored(sessionsDir)
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n')
  })

  it('is idempotent and leaves an existing .gitignore the user edited alone', () => {
    mkdirSync(sessionsDir, { recursive: true })
    writeFileSync(join(sessionsDir, '.gitignore'), '# mine\n*.json\n')
    expect(ensureSessionsDirIgnored(sessionsDir)).toBe(false)
    expect(readFileSync(join(sessionsDir, '.gitignore'), 'utf8')).toBe('# mine\n*.json\n')
  })

  it('returns false on the second call', () => {
    expect(ensureSessionsDirIgnored(sessionsDir)).toBe(true)
    expect(ensureSessionsDirIgnored(sessionsDir)).toBe(false)
  })
})
