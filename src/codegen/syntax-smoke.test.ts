import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@storage/db'
import { appendAction } from '@storage/action-repo'
import { createSession } from '@storage/session-repo'
import { generate } from './index'
import { syntaxErrors } from './ts-syntax.test-util'
import type { Session } from '@shared/types/session'
import type { ActionType, RecordedAction } from '@shared/types/action'
import type { FrameworkId } from '@shared/types/generated'
import type { FrameContext, ShadowContext } from '@shared/types/locator'

const SESSION_ID = 'syntax-smoke'
const PAGE_URL = 'https://example.com/app'

function session(): Session {
  return {
    sessionId: SESSION_ID,
    name: 'Rich "quoted" flow',
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

interface Spec {
  type: ActionType
  testId: string
  tag: string
  payload?: Record<string, unknown>
  attrs?: Record<string, string>
  shadow?: ShadowContext
  frame?: FrameContext
}

function action(spec: Spec): RecordedAction {
  return {
    actionId: crypto.randomUUID(),
    sessionId: SESSION_ID,
    sequenceNumber: seq++,
    type: spec.type,
    timestamp: seq,
    pageUrl: PAGE_URL,
    payload: spec.payload,
    target: {
      primaryLocator: {
        strategy: 'testid',
        selector: spec.testId,
        framework: { playwright: `getByTestId('${spec.testId}')` },
        score: 95,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: {
        tagName: spec.tag,
        attributes: { 'data-testid': spec.testId, ...spec.attrs },
        textContent: 'Say "hi"',
      },
      shadowContext: spec.shadow,
      frameContext: spec.frame,
    },
  }
}

const RECORDED: Spec[] = [
  {
    type: 'fill',
    testId: 'email',
    tag: 'input',
    payload: { value: 'a@b.com' },
    attrs: { type: 'email' },
  },
  {
    type: 'fill',
    testId: 'pass"word',
    tag: 'input',
    payload: { value: 'it\'s "secret"' },
    attrs: { type: 'password' },
  },
  { type: 'select', testId: "coun'try", tag: 'select', payload: { value: 'tr' } },
  { type: 'check', testId: 'terms', tag: 'input', attrs: { type: 'checkbox' } },
  { type: 'hover', testId: 'menu', tag: 'div' },
  { type: 'dblclick', testId: 'row', tag: 'tr' },
  {
    type: 'click',
    testId: 'in-shadow',
    tag: 'button',
    shadow: { hostChain: ['my-card', 'x-footer'] },
  },
  {
    type: 'click',
    testId: 'in-frame',
    tag: 'button',
    frame: { frameChain: ['iframe[name="pay"]'] },
  },
  { type: 'click', testId: 'submit', tag: 'button' },
  {
    type: 'network',
    testId: 'n',
    tag: 'x',
    payload: {
      method: 'POST',
      url: 'https://api.example.com/api/orders?x=1&y="2"',
      status: 201,
      contentType: 'application/json',
      responseBody: '{"id":1,"note":"it\'s \\"ok\\""}',
    },
  },
]

beforeEach(async () => {
  seq = 0
  await db.actions.clear()
  await db.sessions.clear()
  await createSession(session())
  for (const spec of RECORDED) {
    const a = action(spec)
    if (spec.type === 'network') a.target = undefined
    await appendAction(a)
  }
})

async function sources(framework: FrameworkId, ext: string): Promise<Array<[string, string]>> {
  const code = await generate(SESSION_ID, framework, { includeMocks: true })
  return code.files.filter((f) => f.filename.endsWith(ext)).map((f) => [f.filename, f.content])
}

describe('generated code is syntactically valid', () => {
  it('playwright-ts output parses as TypeScript', async () => {
    const files = await sources('playwright-ts', '.ts')
    expect(files.length).toBeGreaterThan(0)
    for (const [name, content] of files) {
      expect(syntaxErrors(content, name), name).toEqual([])
    }
  })

  it('cypress output parses as JavaScript', async () => {
    const files = await sources('cypress', '.js')
    expect(files.length).toBeGreaterThan(0)
    for (const [name, content] of files) {
      expect(syntaxErrors(content, name), name).toEqual([])
    }
  })
})

describe('the syntax checker itself', () => {
  it('reports a genuinely broken snippet', () => {
    expect(syntaxErrors('const x = {', 'broken.ts').length).toBeGreaterThan(0)
  })

  it('accepts valid TypeScript', () => {
    expect(syntaxErrors('export class A { get x(): number { return 1 } }', 'ok.ts')).toEqual([])
  })

  it('is validating the rich output, not an empty project', async () => {
    const all = (await sources('playwright-ts', '.ts')).map(([, c]) => c).join('\n')
    expect(all).toContain('page.route(')
    expect(all).toContain('selectOption(')
    expect(all).toContain('.dblclick()')
    const cy = (await sources('cypress', '.js')).map(([, c]) => c).join('\n')
    expect(cy).toContain('cy.intercept(')
    expect(cy).toContain('.dblclick()')
  })
})
