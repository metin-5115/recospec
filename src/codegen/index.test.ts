import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@storage/db'
import { appendAction } from '@storage/action-repo'
import { createSession } from '@storage/session-repo'
import { generateForSession as generate } from '../background/generate-for-session'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'

const SESSION_ID = 'gen-sel'

function session(): Session {
  return {
    sessionId: SESSION_ID,
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

function clickAction(seq: number): RecordedAction {
  return {
    actionId: crypto.randomUUID(),
    sessionId: SESSION_ID,
    sequenceNumber: seq,
    type: 'click',
    timestamp: 0,
    pageUrl: 'https://example.com/login',
    target: {
      primaryLocator: {
        strategy: 'testid',
        selector: '[data-testid="submit"]',
        framework: { playwright: "getByTestId('submit')" },
        score: 95,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Submit' },
    },
  }
}

beforeEach(async () => {
  await db.actions.clear()
  await db.sessions.clear()
  await createSession(session())
  await appendAction(clickAction(0))
})

const isScaffold = (f: string): boolean =>
  f.endsWith('package.json') || f.endsWith('.config.ts') || f === 'tsconfig.json'
const isTest = (names: string[]): boolean => names.some((f) => f.includes('.spec.ts'))
const isPage = (names: string[]): boolean =>
  names.some((f) => f.includes('Page') && f.endsWith('.ts') && !f.includes('.spec.'))

describe('generate() output selection', () => {
  it('omitting selection emits the full project (back-compat)', async () => {
    const code = await generate(SESSION_ID, 'playwright-ts')
    const names = code.files.map((f) => f.filename)
    expect(isPage(names)).toBe(true)
    expect(isTest(names)).toBe(true)
    expect(names.some(isScaffold)).toBe(true)
  })

  it('opens the session start URL in the generated test', async () => {
    const code = await generate(SESSION_ID, 'playwright-ts', {
      selection: { pageObjects: false, test: true, scaffold: false },
    })
    const spec = code.files.find((f) => f.filename.endsWith('.spec.ts'))
    expect(spec?.content).toContain('await page.goto("/login");')
  })

  it('page-objects-only emits no test and no scaffold', async () => {
    const code = await generate(SESSION_ID, 'playwright-ts', {
      selection: { pageObjects: true, test: false, scaffold: false },
    })
    const names = code.files.map((f) => f.filename)
    expect(isPage(names)).toBe(true)
    expect(isTest(names)).toBe(false)
    expect(names.some(isScaffold)).toBe(false)
  })

  it('test-only emits the spec but no scaffold config', async () => {
    const code = await generate(SESSION_ID, 'playwright-ts', {
      selection: { pageObjects: false, test: true, scaffold: false },
    })
    const names = code.files.map((f) => f.filename)
    expect(isTest(names)).toBe(true)
    expect(names.some(isScaffold)).toBe(false)
    expect(isPage(names)).toBe(false)
  })

  it('scaffold off keeps page object + test', async () => {
    const code = await generate(SESSION_ID, 'playwright-ts', {
      selection: { pageObjects: true, test: true, scaffold: false },
    })
    const names = code.files.map((f) => f.filename)
    expect(isPage(names)).toBe(true)
    expect(isTest(names)).toBe(true)
    expect(names.some(isScaffold)).toBe(false)
  })

  it('an empty selection throws', async () => {
    await expect(
      generate(SESSION_ID, 'playwright-ts', {
        selection: { pageObjects: false, test: false, scaffold: false },
      }),
    ).rejects.toThrow(/select at least one/i)
  })

  it('BDD + test-only emits a .feature, not a vanilla spec', async () => {
    const code = await generate(SESSION_ID, 'playwright-ts', {
      bdd: true,
      selection: { pageObjects: false, test: true, scaffold: false },
    })
    const names = code.files.map((f) => f.filename)
    expect(names.some((f) => f.endsWith('.feature'))).toBe(true)
    expect(isTest(names)).toBe(false)
    expect(names.some(isScaffold)).toBe(false)
  })
})
