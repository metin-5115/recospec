import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@storage/db'
import { appendAction } from '@storage/action-repo'
import { createSession } from '@storage/session-repo'
import { generate } from './index'
import { validatePythonSource } from './adapters/selenium-py/python-validate'
import { validateJavaSource } from './adapters/selenium-java/java-validate'
import type { Session } from '@shared/types/session'
import type { ActionType, RecordedAction } from '@shared/types/action'
import type { FrameworkId } from '@shared/types/generated'

const SESSION_ID = 'keyboard-hover-e2e'
const PROCESS_SPAWN_TIMEOUT_MS = 30_000
const PAGE_URL = 'https://example.com/shop'

/** Lines a keyboard or hover step produces, plus the inferred method that wraps the search. */
const INTERESTING_LINE =
  /search|\bpress\b|hover|ENTER|Keys\.|keyboard|trigger\('mouseover'\)|Actions|ActionChains/i

function session(): Session {
  return {
    sessionId: SESSION_ID,
    name: 'Search shop',
    state: 'stopped',
    startUrl: PAGE_URL,
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
  tagName: string,
  payload?: Record<string, unknown>,
): RecordedAction {
  return {
    actionId: crypto.randomUUID(),
    sessionId: SESSION_ID,
    sequenceNumber: seq++,
    type,
    timestamp: seq,
    pageUrl: PAGE_URL,
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
        attributes: { 'data-testid': testId },
        textContent: '',
      },
    },
  }
}

beforeEach(async () => {
  seq = 0
  await db.actions.clear()
  await db.sessions.clear()
  await createSession(session())
  // Recorder output for: type a query and submit it with Enter, then open a hover menu
  // and pick an item from it — the shape the keyboard and hover capture now produces.
  const recorded: RecordedAction[] = [
    action('fill', 'search-input', 'input', { value: 'shoes' }),
    action('keypress', 'search-input', 'input', { key: 'Enter' }),
    action('hover', 'products-menu', 'a'),
    action('click', 'shoes-link', 'a'),
  ]
  for (const a of recorded) await appendAction(a)
})

async function interestingLines(framework: FrameworkId): Promise<string[]> {
  const code = await generate(SESSION_ID, framework)
  return code.files
    .filter((f) => /\.(ts|js|py|java)$/.test(f.filename))
    .flatMap((f) => f.content.split('\n').map((line) => line.trim()))
    .filter((line) => INTERESTING_LINE.test(line))
}

describe('recorded Enter and hover reach every adapter', () => {
  it('playwright-ts', async () => {
    const lines = await interestingLines('playwright-ts')
    expect(lines.join('\n')).toContain('page.keyboard.press("Enter")')
    expect(lines.join('\n')).toContain('.hover()')
    expect(lines).toMatchSnapshot()
  })

  it('cypress', async () => {
    const lines = await interestingLines('cypress')
    expect(lines.join('\n')).toContain('{enter}')
    expect(lines.join('\n')).toContain(`.trigger('mouseover')`)
    expect(lines).toMatchSnapshot()
  })

  it(
    'selenium-py (and the output parses as Python)',
    async () => {
      const code = await generate(SESSION_ID, 'selenium-py')
      for (const f of code.files.filter((file) => file.filename.endsWith('.py'))) {
        const result = validatePythonSource(f.content)
        expect(result.ok, `${f.filename}: ${result.error}`).toBe(true)
      }
      const lines = await interestingLines('selenium-py')
      expect(lines.join('\n')).toContain('Keys.ENTER')
      expect(lines.join('\n')).toContain('ActionChains(')
      expect(lines).toMatchSnapshot()
    },
    PROCESS_SPAWN_TIMEOUT_MS,
  )

  it('selenium-java (and the output has balanced brackets)', async () => {
    const code = await generate(SESSION_ID, 'selenium-java')
    for (const f of code.files.filter((file) => file.filename.endsWith('.java'))) {
      const result = validateJavaSource(f.content)
      expect(result.ok, `${f.filename}: ${JSON.stringify(result.issues)}`).toBe(true)
    }
    const lines = await interestingLines('selenium-java')
    expect(lines.join('\n')).toContain('Keys.ENTER')
    expect(lines.join('\n')).toContain('new Actions(driver)')
    expect(lines).toMatchSnapshot()
  })

  it(
    'a recorded fill + Enter is inferred as a search method on every adapter',
    async () => {
      for (const framework of [
        'playwright-ts',
        'cypress',
        'selenium-py',
        'selenium-java',
      ] as const) {
        const lines = await interestingLines(framework)
        expect(
          lines.some((line) => /\bsearch\b/i.test(line)),
          `${framework}: no search method`,
        ).toBe(true)
      }
    },
    PROCESS_SPAWN_TIMEOUT_MS,
  )
})
