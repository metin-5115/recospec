import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAdd } from './add'
import type { ConflictReporter } from '@codegen/apply/conflict-reporter'
import type { JsonExportPayload } from '@codegen/export/json-export'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'

function makeSession(): Session {
  return {
    sessionId: 'session-1',
    name: 'Login Flow',
    state: 'stopped',
    startUrl: 'https://example.com/login',
    startedAt: 0,
    metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'sig',
  }
}

function clickAction(): RecordedAction {
  return {
    actionId: 'a0',
    sessionId: 'session-1',
    sequenceNumber: 0,
    type: 'click',
    timestamp: 0,
    pageUrl: 'https://example.com/login',
    target: {
      primaryLocator: {
        strategy: 'aria-label',
        selector: '[aria-label="Sign In"]',
        framework: {},
        score: 100,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: {
        tagName: 'button',
        attributes: { type: 'submit', 'aria-label': 'Sign In' },
        textContent: 'Sign In',
      },
    },
  }
}

function makePayload(): JsonExportPayload {
  return {
    exportedAt: 0,
    formatVersion: 1,
    session: makeSession(),
    actions: [clickAction()],
  }
}

/** A reporter that should never fire for a fresh (empty) target dir. */
const failingReporter: ConflictReporter = {
  resolve: () => {
    throw new Error('reporter should not be called for new files')
  },
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(String((e as { parentPath?: string }).parentPath ?? dir), e.name))
    .map((p) => p.replace(dir, '').replace(/\\/g, '/'))
}

let tmp: string
let jsonPath: string
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'recospec-add-'))
  jsonPath = join(tmp, 'session.json')
  writeFileSync(jsonPath, JSON.stringify(makePayload()), 'utf8')
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  logSpy.mockRestore()
  rmSync(tmp, { recursive: true, force: true })
})

describe('runAdd output selection', () => {
  it('page-objects-only writes a page object and no test spec', async () => {
    await runAdd(
      {
        json: jsonPath,
        projectDir: tmp,
        framework: 'playwright-ts',
        selection: { pageObjects: true, test: false },
      },
      failingReporter,
    )
    const files = listFiles(tmp)
    expect(files.some((f) => f.startsWith('/pages/') && f.endsWith('.ts'))).toBe(true)
    expect(files.some((f) => f.includes('.spec.ts'))).toBe(false)
    // Never scaffold.
    expect(files.some((f) => f.endsWith('package.json'))).toBe(false)
  })

  it('test-only writes the spec and no page object', async () => {
    await runAdd(
      {
        json: jsonPath,
        projectDir: tmp,
        framework: 'playwright-ts',
        selection: { pageObjects: false, test: true },
      },
      failingReporter,
    )
    const files = listFiles(tmp)
    expect(files.some((f) => f.includes('.spec.ts'))).toBe(true)
    expect(files.some((f) => f.startsWith('/pages/'))).toBe(false)
  })

  it('writes a spec that opens the start URL and imports the page object it was written next to', async () => {
    await runAdd({ json: jsonPath, projectDir: tmp, framework: 'playwright-ts' }, failingReporter)
    const spec = readFileSync(join(tmp, 'tests', 'scenario.spec.ts'), 'utf8')
    expect(spec).toContain('await page.goto("https://example.com/login");')
    const imported = spec.match(/from '(\.\.\/pages\/\w+)'/)?.[1]
    expect(imported).toBeDefined()
    expect(existsSync(join(tmp, 'tests', `${imported}.ts`))).toBe(true)
  })

  it('default selection writes both page object and spec but no scaffold', async () => {
    await runAdd({ json: jsonPath, projectDir: tmp, framework: 'playwright-ts' }, failingReporter)
    const files = listFiles(tmp)
    expect(files.some((f) => f.startsWith('/pages/') && f.endsWith('.ts'))).toBe(true)
    expect(files.some((f) => f.includes('.spec.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('package.json'))).toBe(false)
  })
})

describe('runAdd render options', () => {
  function writeNetworkPayload(): void {
    const network: RecordedAction = {
      actionId: 'a1',
      sessionId: 'session-1',
      sequenceNumber: 1,
      type: 'network',
      timestamp: 1,
      pageUrl: 'https://example.com/login',
      payload: {
        method: 'POST',
        url: 'https://example.com/api/login',
        status: 200,
        contentType: 'application/json',
        responseBody: '{"ok":true}',
      },
    }
    const payload = makePayload()
    payload.actions = [clickAction(), network]
    writeFileSync(jsonPath, JSON.stringify(payload), 'utf8')
  }

  function readAllOutput(dir: string): string {
    return listFiles(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
  }

  it('emits network mocks only for the run that asked for them', async () => {
    writeNetworkPayload()
    await runAdd(
      { json: jsonPath, projectDir: tmp, framework: 'playwright-ts', includeMocks: true },
      failingReporter,
    )
    expect(readAllOutput(tmp)).toContain('.route(')

    const second = mkdtempSync(join(tmpdir(), 'recospec-add-'))
    try {
      await runAdd(
        { json: jsonPath, projectDir: second, framework: 'playwright-ts' },
        failingReporter,
      )
      expect(readAllOutput(second)).not.toContain('.route(')
    } finally {
      rmSync(second, { recursive: true, force: true })
    }
  })
})
