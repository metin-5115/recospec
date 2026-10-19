import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@storage/db'
import { appendAction } from '@storage/action-repo'
import { createSession } from '@storage/session-repo'
import { generate } from './index'
import { validatePythonSource } from './adapters/selenium-py/python-validate'
import { validateJavaSource } from './adapters/selenium-java/java-validate'
import { syntaxErrors } from './ts-syntax.test-util'
import type { Session } from '@shared/types/session'
import type { ActionType, RecordedAction } from '@shared/types/action'

const SESSION_ID = 'upload-e2e'
const PROCESS_SPAWN_TIMEOUT_MS = 30_000
const PAGE_URL = 'https://example.com/profile'

function session(): Session {
  return {
    sessionId: SESSION_ID,
    name: 'Profile flow',
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
  // Recorder output for: choose a profile picture, then save.
  const recorded: RecordedAction[] = [
    action(
      'upload',
      'avatar',
      'input',
      { fileNames: ['me.png'], multiple: false },
      { type: 'file' },
    ),
    action('click', 'save', 'button'),
  ]
  for (const a of recorded) await appendAction(a)
})

describe('a recorded file upload reaches every adapter', () => {
  it('playwright-ts', async () => {
    const code = await generate(SESSION_ID, 'playwright-ts')
    const all = code.files.map((f) => f.content).join('\n')
    expect(all).toContain('.setInputFiles("fixtures/me.png")')
    expect(all).not.toContain('fakepath')
    expect(code.files.map((f) => f.filename)).toContain('fixtures/.gitkeep')
    for (const f of code.files.filter((x) => x.filename.endsWith('.ts'))) {
      expect(syntaxErrors(f.content, f.filename)).toEqual([])
    }
  })

  it('cypress', async () => {
    const code = await generate(SESSION_ID, 'cypress')
    const all = code.files.map((f) => f.content).join('\n')
    expect(all).toContain('.selectFile("fixtures/me.png")')
    expect(code.files.map((f) => f.filename)).toContain('fixtures/.gitkeep')
  })

  it(
    'selenium-py (and the output parses as Python)',
    async () => {
      const code = await generate(SESSION_ID, 'selenium-py')
      const pyFiles = code.files.filter((f) => f.filename.endsWith('.py'))
      const all = pyFiles.map((f) => f.content).join('\n')
      expect(all).toContain(`.send_keys(os.path.abspath('fixtures/me.png'))`)
      expect(code.files.map((f) => f.filename)).toContain('fixtures/.gitkeep')
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
    expect(all).toContain('.sendKeys(java.nio.file.Paths.get("fixtures/me.png")')
    expect(code.files.map((f) => f.filename)).toContain('fixtures/.gitkeep')
    for (const f of javaFiles) {
      const result = validateJavaSource(f.content)
      expect(result.ok, `${f.filename}: ${JSON.stringify(result.issues)}`).toBe(true)
    }
  })

  it('a flow without uploads gets no fixtures folder', async () => {
    await db.actions.clear()
    await appendAction(action('click', 'save', 'button'))
    const code = await generate(SESSION_ID, 'playwright-ts')
    expect(code.files.map((f) => f.filename)).not.toContain('fixtures/.gitkeep')
  })
})
