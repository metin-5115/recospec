import { describe, it, expect } from 'vitest'
import { buildLlmContext } from './llm-context'
import { renderLlmContextCompact } from './llm-context-render'
import { buildPromptDocument, renderPromptMarkdown } from './prompt-export'
import type { JsonExportPayload } from './json-export'
import type { ActionType, RecordedAction } from '@shared/types/action'

const LOGIN_URL = 'https://shop.test/login'
const VALID_PASSWORD = 'Valid-Secret-1'
const WRONG_PASSWORD = 'Wrong-Secret-9'

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
    actionId: `a${seq}`,
    sessionId: 's1',
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
        textContent: '',
      },
    },
  }
}

function loginPayload(password: string, outcome: 'success' | 'error'): JsonExportPayload {
  seq = 0
  const actions = [
    action('fill', 'email', LOGIN_URL, 'input', { type: 'email' }, { value: 'ada@example.com' }),
    action('fill', 'password', LOGIN_URL, 'input', { type: 'password' }, { value: password }),
    action('click', 'sign-in', LOGIN_URL, 'button'),
    outcome === 'error'
      ? action(
          'assert',
          'login-error',
          LOGIN_URL,
          'div',
          {},
          { assertionType: 'text', expected: 'Invalid credentials' },
        )
      : action(
          'assert',
          'welcome',
          'https://shop.test/account',
          'h1',
          {},
          { assertionType: 'visible' },
        ),
  ]
  return {
    exportedAt: 0,
    formatVersion: 1,
    session: {
      sessionId: 's1',
      name: 'Login',
      state: 'stopped',
      startUrl: LOGIN_URL,
      startedAt: 0,
      metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
      config: { captureClicks: true, captureInputs: true, captureNavigation: true },
      iterationNumber: 1,
      flowSignature: 'sig',
    },
    actions,
  }
}

const xml = (payload: JsonExportPayload) =>
  renderPromptMarkdown(buildPromptDocument(payload, { mode: 'prompt', framework: 'playwright-ts' }))
const compact = (payload: JsonExportPayload) =>
  renderLlmContextCompact(buildLlmContext(payload, { task: 'codegen', framework: 'playwright-ts' }))

describe('prompt and LLM context use the same variable names as the generated code', () => {
  it('a failed login points at RECOSPEC_PASSWORD_INVALID', () => {
    const failed = loginPayload(WRONG_PASSWORD, 'error')
    const prompt = xml(failed)
    expect(prompt).toContain('RECOSPEC_PASSWORD_INVALID')
    expect(prompt).toContain('[REDACTED:RECOSPEC_PASSWORD_INVALID]')
    expect(prompt).not.toMatch(/RECOSPEC_PASSWORD(?!_)/)
    expect(prompt).not.toContain(WRONG_PASSWORD)

    const context = compact(failed)
    expect(context).toContain('$RECOSPEC_PASSWORD_INVALID')
    expect(context).not.toMatch(/\$RECOSPEC_PASSWORD(?!_)/)
    expect(context).not.toContain(WRONG_PASSWORD)
  })

  it('a successful login keeps RECOSPEC_PASSWORD', () => {
    const ok = loginPayload(VALID_PASSWORD, 'success')
    expect(xml(ok)).toMatch(/RECOSPEC_PASSWORD(?!_)/)
    expect(xml(ok)).not.toContain('RECOSPEC_PASSWORD_INVALID')
    expect(compact(ok)).toMatch(/\$RECOSPEC_PASSWORD(?!_)/)
    expect(compact(ok)).not.toContain(VALID_PASSWORD)
  })
})
