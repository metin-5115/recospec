import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAdd } from './add'
import { buildJsonExport, type JsonExportPayload } from '@codegen/export/json-export'
import type { ConflictReporter } from '@codegen/apply/conflict-reporter'
import type { FrameworkId } from '@shared/types/generated'
import loginRecording from '../../codegen/__fixtures__/real-login-recording.json'

const PASSWORD = 'fixture-pass-1'
const EMAIL = 'user@example.com'

/** The JSON a user downloads from the side panel: secrets are masked at export time. */
function maskedExport(): JsonExportPayload {
  const recorded = JSON.parse(JSON.stringify(loginRecording)) as JsonExportPayload
  return buildJsonExport(recorded.session, recorded.actions)
}

const reporter: ConflictReporter = {
  resolve: () => {
    throw new Error('a fresh project directory has no conflicts')
  },
}

function allText(dir: string): string {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== 'session.json')
    .map((e) => readFileSync(join(String(e.parentPath), e.name), 'utf8'))
    .join('\n')
}

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'recospec-masked-'))
  writeFileSync(join(tmp, 'session.json'), JSON.stringify(maskedExport()), 'utf8')
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

describe('recospec add from a masked JSON export', () => {
  const ENV_READ: Record<FrameworkId, RegExp> = {
    'playwright-ts': /process\.env\.RECOSPEC_PASSWORD/,
    cypress: /Cypress\.env\("password"\)/,
    'selenium-py': /RECOSPEC_PASSWORD/,
    'selenium-java': /TestData\.get\("RECOSPEC_PASSWORD"/,
  }

  it.each(Object.keys(ENV_READ) as FrameworkId[])(
    '%s: the masked export is on disk without the secret, the output reads the env var',
    async (framework) => {
      expect(readFileSync(join(tmp, 'session.json'), 'utf8')).not.toContain(PASSWORD)
      await runAdd({ json: join(tmp, 'session.json'), projectDir: tmp, framework }, reporter)
      const written = allText(tmp)
      expect(written).toMatch(ENV_READ[framework])
      expect(written).not.toContain(PASSWORD)
      expect(written).not.toContain(EMAIL)
      expect(written).not.toContain('REDACTED')
    },
  )

  it('bdd: the feature refers to the env var and the steps resolve it', async () => {
    await runAdd(
      { json: join(tmp, 'session.json'), projectDir: tmp, framework: 'playwright-ts', bdd: true },
      reporter,
    )
    const written = allText(tmp)
    expect(written).toContain('$RECOSPEC_PASSWORD')
    expect(written).toContain('secretValue')
    expect(written).not.toContain(PASSWORD)
    expect(written).not.toContain('REDACTED')
  })
})
