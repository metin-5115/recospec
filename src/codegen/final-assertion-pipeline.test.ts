import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@storage/db'
import { appendAction } from '@storage/action-repo'
import { createSession } from '@storage/session-repo'
import { generateForSession as generate } from '../background/generate-for-session'
import { validatePythonSource } from './adapters/selenium-py/python-validate'
import { validateJavaSource } from './adapters/selenium-java/java-validate'
import { syntaxErrors } from './ts-syntax.test-util'
import { typeErrors } from './ts-typecheck.test-util'
import { resolveOutputPath } from './export/output-path'
import type { Session } from '@shared/types/session'
import type { ActionType, RecordedAction } from '@shared/types/action'
import type { FrameworkId } from '@shared/types/generated'

const SESSION_ID = 'final-assertion-e2e'
const PROCESS_SPAWN_TIMEOUT_MS = 30_000
const TYPECHECK_TIMEOUT_MS = 30_000

function session(): Session {
  return {
    sessionId: SESSION_ID,
    name: 'Add to cart',
    state: 'stopped',
    startUrl: 'https://shop.test/products',
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
        tagName: 'button',
        attributes: { 'data-testid': testId },
        textContent: testId,
      },
    },
  }
}

async function record(...actions: RecordedAction[]): Promise<void> {
  await db.actions.clear()
  for (const a of actions) await appendAction(a)
}

beforeEach(async () => {
  seq = 0
  await db.sessions.clear()
  await createSession(session())
})

async function allSource(framework: FrameworkId, finalStateAssertion?: boolean): Promise<string> {
  const code = await generate(SESSION_ID, framework, { finalStateAssertion })
  return code.files.map((f) => f.content).join('\n')
}

describe('a recording without assertions still verifies where it ended', () => {
  beforeEach(async () => {
    await record(
      action('click', 'add-to-cart', 'https://shop.test/products'),
      action('click', 'checkout', 'https://shop.test/cart'),
    )
  })

  it(
    'playwright-ts asserts the final URL and type-checks',
    async () => {
      const code = await generate(SESSION_ID, 'playwright-ts')
      const all = code.files.map((f) => f.content).join('\n')
      expect(all).toContain('toHaveURL(new RegExp("/cart(?:[?#]|$)"))')
      for (const f of code.files.filter((x) => x.filename.endsWith('.ts'))) {
        expect(syntaxErrors(f.content, f.filename)).toEqual([])
      }
      const layout = Object.fromEntries(
        code.files
          .filter((f) => f.filename.endsWith('.ts'))
          .map((f) => [resolveOutputPath(f.filename, 'playwright-ts'), f.content]),
      )
      expect(typeErrors(layout)).toEqual([])
    },
    TYPECHECK_TIMEOUT_MS,
  )

  it('cypress', async () => {
    expect(await allSource('cypress')).toContain(`cy.url().should('include', "/cart")`)
  })

  it(
    'selenium-py parses as Python',
    async () => {
      const code = await generate(SESSION_ID, 'selenium-py')
      const py = code.files.filter((f) => f.filename.endsWith('.py'))
      expect(py.map((f) => f.content).join('\n')).toContain("EC.url_contains('/cart')")
      for (const f of py) {
        const result = validatePythonSource(f.content)
        expect(result.ok, `${f.filename}: ${result.error}`).toBe(true)
      }
    },
    PROCESS_SPAWN_TIMEOUT_MS,
  )

  it('selenium-java has balanced brackets', async () => {
    const code = await generate(SESSION_ID, 'selenium-java')
    const java = code.files.filter((f) => f.filename.endsWith('.java'))
    expect(java.map((f) => f.content).join('\n')).toContain(
      'ExpectedConditions.urlContains("/cart")',
    )
    for (const f of java) {
      const result = validateJavaSource(f.content)
      expect(result.ok, `${f.filename}: ${JSON.stringify(result.issues)}`).toBe(true)
    }
  })

  it('stays out when the option is switched off', async () => {
    expect(await allSource('playwright-ts', false)).not.toContain('toHaveURL')
  })
})

describe('a recording the user already asserted on', () => {
  it('gets no extra URL assertion', async () => {
    await record(
      action('click', 'checkout', 'https://shop.test/cart'),
      action('assert', 'total', 'https://shop.test/cart', { assertionType: 'visible' }),
    )
    expect(await allSource('playwright-ts')).not.toContain('toHaveURL')
  })
})
