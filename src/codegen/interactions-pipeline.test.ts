import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@storage/db'
import { appendAction } from '@storage/action-repo'
import { createSession } from '@storage/session-repo'
import { generateForSession as generate } from '../background/generate-for-session'
import { validatePythonSource } from './adapters/selenium-py/python-validate'
import { validateJavaSource } from './adapters/selenium-java/java-validate'
import type { Session } from '@shared/types/session'
import type { ActionType, RecordedAction } from '@shared/types/action'
import type { FrameworkId } from '@shared/types/generated'

const SESSION_ID = 'interactions-e2e'
const PROCESS_SPAWN_TIMEOUT_MS = 30_000
const PAGE_URL = 'https://example.com/checkout'

function session(): Session {
  return {
    sessionId: SESSION_ID,
    name: 'Checkout flow',
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
  attributes: Record<string, string> = {},
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
        attributes: { 'data-testid': testId, ...attributes },
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
  // Recorder output for: pick a country, hover a menu, double-click a row,
  // tick the terms box, then submit. (A real dblclick is preceded by two clicks.)
  const recorded: RecordedAction[] = [
    action('select', 'country', 'select', { value: 'tr', label: 'Türkiye' }),
    action('hover', 'account-menu', 'div'),
    action('click', 'row', 'tr'),
    action('click', 'row', 'tr'),
    action('dblclick', 'row', 'tr'),
    action('check', 'terms', 'input', undefined, { type: 'checkbox' }),
    action('click', 'submit', 'button'),
  ]
  for (const a of recorded) await appendAction(a)
})

async function pagesAndSpec(framework: FrameworkId): Promise<{ all: string; names: string[] }> {
  const code = await generate(SESSION_ID, framework)
  return {
    all: code.files.map((f) => f.content).join('\n'),
    names: code.files.map((f) => f.filename),
  }
}

describe('recorded select / check / hover / dblclick reach every adapter', () => {
  it('playwright-ts', async () => {
    const { all } = await pagesAndSpec('playwright-ts')
    expect(all).toMatch(/selectOption\(/)
    expect(all).toMatch(/setChecked\(|\.check\(\)/)
    expect(all).toContain('.hover()')
    expect(all).toContain('.dblclick()')
  })

  it('cypress', async () => {
    const { all } = await pagesAndSpec('cypress')
    expect(all).toContain('.select(')
    expect(all).toMatch(/\.check\(\)/)
    expect(all).toContain(`.trigger('mouseover')`)
    expect(all).toContain('.dblclick()')
  })

  // Spawns one Python process per generated file, so give it headroom when the
  // whole suite is running in parallel.
  it(
    'selenium-py (and the output parses as Python)',
    async () => {
      const code = await generate(SESSION_ID, 'selenium-py')
      const pyFiles = code.files.filter((f) => f.filename.endsWith('.py'))
      const all = pyFiles.map((f) => f.content).join('\n')
      expect(all).toContain('select_by_value(')
      expect(all).toContain('.is_selected()')
      expect(all).toContain('ActionChains(')
      expect(pyFiles.length).toBeGreaterThan(0)
      for (const f of pyFiles) {
        const result = validatePythonSource(f.content)
        expect(result.ok, `${f.filename}: ${result.error}`).toBe(true)
      }
    },
    PROCESS_SPAWN_TIMEOUT_MS,
  )

  it('selenium-java (and the output has balanced brackets)', async () => {
    const code = await generate(SESSION_ID, 'selenium-java')
    const javaFiles = code.files.filter((f) => f.filename.endsWith('.java'))
    const all = javaFiles.map((f) => f.content).join('\n')
    expect(all).toContain('new Select(')
    expect(all).toContain('.isSelected()')
    // The parameter shares the element's name — the field must be addressed via `this.`.
    expect(all).toContain('this.terms.isSelected()')
    expect(all).toContain('new Actions(driver)')
    for (const f of javaFiles) {
      const result = validateJavaSource(f.content)
      expect(result.ok, `${f.filename}: ${JSON.stringify(result.issues)}`).toBe(true)
    }
  })

  it('the two clicks preceding the dblclick do not leak into the output', async () => {
    const { all } = await pagesAndSpec('playwright-ts')
    // Only the dblclick targets the row — no plain `.click()` on it.
    expect(all).not.toMatch(/row[^\n]*\.click\(\)/i)
  })
})
