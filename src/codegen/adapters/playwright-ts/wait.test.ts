import { describe, it, expect } from 'vitest'
import { renderScenario, renderPageObject } from './index'
import type { IRElement, IRPage, IRScenario, IRStep } from '../../ir/types'

const spinnerEl: IRElement = {
  name: 'loadingSpinner',
  locatorStrategy: 'css',
  locatorValue: '.spinner',
  tagName: 'div',
}

function pageWith(steps: IRStep[], elements: IRElement[] = []): IRPage {
  return {
    name: 'Home',
    className: 'HomePage',
    normalizedUrl: '/',
    elements,
    steps,
  }
}

describe('playwright-ts wait rendering — scenario', () => {
  it('never generates a networkidle wait', () => {
    const scenario: IRScenario = {
      name: 'flow',
      pages: [
        pageWith([
          { id: 'n1', action: 'navigate', url: '/' },
          { id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 10_000 } },
        ]),
      ],
    }
    expect(renderScenario(scenario)).not.toContain('waitForLoadState')
  })

  it('turns a networkidle wait into waitForURL when the route it ended on is known', () => {
    const scenario: IRScenario = {
      name: 'flow',
      pages: [
        pageWith([
          { id: 'n1', action: 'navigate', url: '/' },
          {
            id: 'w1',
            action: 'wait',
            pageUrl: '/dashboard',
            wait: { reason: 'networkidle', timeoutMs: 10_000 },
          },
        ]),
      ],
    }
    expect(renderScenario(scenario)).toContain('await page.waitForURL(/\\/dashboard(?:[?#]|$)/);')
  })

  it('skips the route wait for parameterised routes', () => {
    const scenario: IRScenario = {
      name: 'flow',
      pages: [
        pageWith([
          {
            id: 'w1',
            action: 'wait',
            pageUrl: '/users/:id',
            wait: { reason: 'networkidle', timeoutMs: 10_000 },
          },
        ]),
      ],
    }
    expect(renderScenario(scenario)).not.toContain('waitForURL')
  })

  it('renders spinner waits as locator.waitFor({ state: "hidden" })', () => {
    const scenario: IRScenario = {
      name: 'flow',
      pages: [
        pageWith(
          [
            { id: 'n1', action: 'navigate', url: '/' },
            {
              id: 'w1',
              action: 'wait',
              element: spinnerEl,
              wait: { reason: 'spinner', timeoutMs: 8000 },
            },
          ],
          [spinnerEl],
        ),
      ],
    }
    const out = renderScenario(scenario)
    expect(out).toContain(`waitFor({ state: 'hidden', timeout: 8000 })`)
    expect(out).toContain(`page.locator(".spinner")`)
  })

  it('matches snapshot for combined wait reasons', () => {
    const scenario: IRScenario = {
      name: 'wait flow',
      pages: [
        pageWith(
          [
            { id: 'n1', action: 'navigate', url: '/' },
            { id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 10_000 } },
            {
              id: 'w2',
              action: 'wait',
              element: spinnerEl,
              wait: { reason: 'spinner', timeoutMs: 6000 },
            },
          ],
          [spinnerEl],
        ),
      ],
    }
    expect(renderScenario(scenario)).toMatchSnapshot()
  })
})

describe('playwright-ts wait rendering — page object', () => {
  it('uses this.<element>.waitFor in inferred-method-style page objects', () => {
    const page: IRPage = {
      name: 'Home',
      className: 'HomePage',
      normalizedUrl: '/',
      elements: [spinnerEl],
      steps: [
        {
          id: 'w1',
          action: 'wait',
          element: spinnerEl,
          wait: { reason: 'spinner', timeoutMs: 7000 },
        },
      ],
    }
    const out = renderPageObject(page)
    expect(out).toContain(`await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 7000 });`)
  })

  it('waits for the route a networkidle wait ended on, not for network idle', () => {
    const page: IRPage = {
      name: 'Home',
      className: 'HomePage',
      normalizedUrl: '/',
      elements: [],
      steps: [
        {
          id: 'w1',
          action: 'wait',
          pageUrl: '/dashboard',
          wait: { reason: 'networkidle', timeoutMs: 10_000 },
        },
      ],
    }
    const out = renderPageObject(page)
    expect(out).toContain('await this.page.waitForURL(/\\/dashboard(?:[?#]|$)/);')
    expect(out).not.toContain('networkidle')
  })
})
