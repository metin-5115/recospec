import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@storage/db'
import { appendAction } from '@storage/action-repo'
import { createSession } from '@storage/session-repo'
import { generateForSession as generate } from '../background/generate-for-session'
import type { Session } from '@shared/types/session'
import type { ActionType, RecordedAction } from '@shared/types/action'
import type { FrameworkId } from '@shared/types/generated'

const SESSION_ID = 'login-flows'
const LOGIN_URL = 'https://shop.test/login'
const HOME_URL = 'https://shop.test/account'
const VALID_PASSWORD = 'Valid-Secret-1'
const WRONG_PASSWORD = 'Wrong-Secret-9'

function session(): Session {
  return {
    sessionId: SESSION_ID,
    name: 'Login',
    state: 'stopped',
    startUrl: LOGIN_URL,
    startedAt: 0,
    metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'sig',
  }
}

let seq = 0

function action(
  type: ActionType,
  testId: string,
  pageUrl: string,
  tagName: string,
  attributes: Record<string, string> = {},
  payload?: Record<string, unknown>,
): RecordedAction {
  return {
    actionId: crypto.randomUUID(),
    sessionId: SESSION_ID,
    sequenceNumber: seq++,
    type,
    timestamp: seq,
    pageUrl,
    payload,
    target: {
      primaryLocator: {
        strategy: 'testid',
        selector: `[data-testid="${testId}"]`,
        framework: { playwright: `getByTestId('${testId}')` },
        score: 95,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: {
        tagName,
        attributes: { 'data-testid': testId, ...attributes },
        textContent: tagName === 'button' ? 'Sign in' : '',
      },
    },
  }
}

const emailFill = () =>
  action('fill', 'email', LOGIN_URL, 'input', { type: 'email' }, { value: 'ada@example.com' })
const passwordFill = (value: string) =>
  action('fill', 'password', LOGIN_URL, 'input', { type: 'password' }, { value })

async function record(...actions: RecordedAction[]): Promise<void> {
  await db.actions.clear()
  for (const a of actions) await appendAction(a)
}

const successful = () => [
  emailFill(),
  passwordFill(VALID_PASSWORD),
  action('click', 'sign-in', LOGIN_URL, 'button'),
  action('assert', 'welcome', HOME_URL, 'h1', {}, { assertionType: 'visible' }),
]

const failed = () => [
  emailFill(),
  passwordFill(WRONG_PASSWORD),
  action('click', 'sign-in', LOGIN_URL, 'button'),
  action(
    'assert',
    'login-error',
    LOGIN_URL,
    'div',
    {},
    { assertionType: 'text', expected: 'Invalid credentials' },
  ),
]

beforeEach(async () => {
  seq = 0
  await db.sessions.clear()
  await createSession(session())
})

const FRAMEWORKS: FrameworkId[] = ['playwright-ts', 'cypress', 'selenium-py', 'selenium-java']

async function output(framework: FrameworkId): Promise<string> {
  const code = await generate(SESSION_ID, framework)
  return code.files.map((f) => `// ${f.filename}\n${f.content}`).join('\n')
}

/** `RECOSPEC_PASSWORD` that is not followed by a suffix. */
const BASE_PASSWORD_VAR = /RECOSPEC_PASSWORD(?!_)/
/** Cypress reads `Cypress.env("password")`; its JSON example uses the same keys. */
const CYPRESS_INVALID_KEY = /passwordInvalid/

describe.each(FRAMEWORKS)('%s: login flows', (framework) => {
  it('a successful login reads only the regular password variable', async () => {
    await record(...successful())
    const out = await output(framework)
    if (framework === 'cypress') {
      expect(out).toContain('Cypress.env("password")')
      expect(out).not.toMatch(CYPRESS_INVALID_KEY)
    } else {
      expect(out).toMatch(BASE_PASSWORD_VAR)
      expect(out).not.toContain('RECOSPEC_PASSWORD_INVALID')
    }
  })

  it('a failed login reads the invalid-password variable instead', async () => {
    await record(...failed())
    const out = await output(framework)
    if (framework === 'cypress') {
      expect(out).toContain('Cypress.env("passwordInvalid")')
      expect(out).not.toContain('Cypress.env("password")')
    } else {
      expect(out).toContain('RECOSPEC_PASSWORD_INVALID')
      expect(out).not.toMatch(BASE_PASSWORD_VAR)
    }
  })

  it('never writes either recorded password', async () => {
    for (const recorded of [successful(), failed()]) {
      await record(...recorded)
      const out = await output(framework)
      expect(out).not.toContain(VALID_PASSWORD)
      expect(out).not.toContain(WRONG_PASSWORD)
    }
  })
})

describe('environment templates list the new variable', () => {
  it('Playwright .env.example', async () => {
    await record(...failed())
    const code = await generate(SESSION_ID, 'playwright-ts')
    const env = code.files.find((f) => f.filename === '.env.example')
    expect(env?.content).toContain('RECOSPEC_PASSWORD_INVALID=')
    expect(env?.content).not.toMatch(BASE_PASSWORD_VAR)
  })

  it('Cypress cypress.env.json.example', async () => {
    await record(...failed())
    const code = await generate(SESSION_ID, 'cypress')
    const env = code.files.find((f) => f.filename === 'cypress.env.json.example')
    expect(env?.content).toContain('passwordInvalid')
  })

  it('Selenium Java properties template', async () => {
    await record(...failed())
    const code = await generate(SESSION_ID, 'selenium-java')
    expect(code.files.map((f) => f.content).join('\n')).toContain('RECOSPEC_PASSWORD_INVALID=')
  })
})
