import { describe, it, expect } from 'vitest'
import { normalizeActions } from '../normalizer/action-normalizer'
import { groupIntoPages } from '../planner/page-grouper'
import { renderPageObject, renderScenario, renderScaffold } from '../adapters/playwright-ts'
import type { RecordedAction } from '@shared/types/action'
import type { IRScenario } from '../ir/types'

function makeAction(
  overrides: Partial<RecordedAction> & Pick<RecordedAction, 'type'>,
  idx: number,
): RecordedAction {
  return {
    actionId: `action-${idx}`,
    sessionId: 'session-1',
    sequenceNumber: idx,
    timestamp: Date.now() + idx * 100,
    pageUrl: 'https://example.com/login',
    ...overrides,
  }
}

const loginFlow: RecordedAction[] = [
  makeAction(
    {
      type: 'fill',
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: '[data-testid="email"]',
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'input', attributes: { type: 'email' }, textContent: '' },
      },
      payload: { value: 'user@example.com' },
    },
    0,
  ),
  makeAction(
    {
      type: 'fill',
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: '[data-testid="password"]',
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'input', attributes: { type: 'password' }, textContent: '' },
      },
      payload: { value: 'secret123' },
    },
    1,
  ),
  makeAction(
    {
      type: 'click',
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: '[data-testid="submit"]',
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: {
          tagName: 'button',
          attributes: { type: 'submit' },
          textContent: 'Sign In',
        },
      },
    },
    2,
  ),
  makeAction(
    {
      type: 'navigate',
      pageUrl: 'https://example.com/dashboard',
      pageTitle: 'Dashboard',
    },
    3,
  ),
  makeAction(
    {
      type: 'click',
      pageUrl: 'https://example.com/dashboard',
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: '[data-testid="welcome-msg"]',
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'div', attributes: {}, textContent: 'Welcome' },
      },
    },
    4,
  ),
]

describe('full pipeline — login flow', () => {
  it('produces LoginPage and DashboardPage files', () => {
    const { flatSteps } = normalizeActions(loginFlow)
    const pages = groupIntoPages(flatSteps, 'https://example.com/login')
    expect(pages.map((p) => p.className)).toContain('LoginPage')
    expect(pages.map((p) => p.className)).toContain('DashboardPage')
  })

  it('infers login method on LoginPage', () => {
    const { flatSteps } = normalizeActions(loginFlow)
    const pages = groupIntoPages(flatSteps, 'https://example.com/login')
    const loginPage = pages.find((p) => p.className === 'LoginPage')!
    expect(loginPage.inferredMethods?.some((m) => m.name === 'login')).toBe(true)
  })

  it('renderPageObject produces valid TypeScript class', () => {
    const { flatSteps } = normalizeActions(loginFlow)
    const pages = groupIntoPages(flatSteps, 'https://example.com/login')
    const loginPage = pages.find((p) => p.className === 'LoginPage')!
    const output = renderPageObject(loginPage)
    expect(output).toContain('export class LoginPage')
    expect(output).toContain('async goto()')
    expect(output).toContain('async login(')
  })

  it('renderScenario wraps in test.describe', () => {
    const { flatSteps } = normalizeActions(loginFlow)
    const pages = groupIntoPages(flatSteps, 'https://example.com/login')
    const scenario: IRScenario = { name: 'Login flow', pages }
    const output = renderScenario(scenario)
    expect(output).toContain("test.describe('Login flow'")
    expect(output).toContain("test('full flow'")
    expect(output).toContain('import { LoginPage }')
    expect(output).toContain('import { DashboardPage }')
  })

  it('renderScaffold produces package.json, playwright.config.ts and tsconfig.json', () => {
    const files = renderScaffold()
    const names = files.map((f) => f.filename)
    expect(names).toContain('package.json')
    expect(names).toContain('playwright.config.ts')
    expect(names).toContain('tsconfig.json')
    // package.json should be valid JSON
    const pkg = JSON.parse(files.find((f) => f.filename === 'package.json')!.content)
    expect(pkg.devDependencies['@playwright/test']).toBeDefined()
  })
})
