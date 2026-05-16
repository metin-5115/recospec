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
  it('renders networkidle as page.waitForLoadState', () => {
    const scenario: IRScenario = {
      name: 'flow',
      pages: [
        pageWith([
          { id: 'n1', action: 'navigate', url: '/' },
          { id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 10_000 } },
        ]),
      ],
    }
    const out = renderScenario(scenario)
    expect(out).toContain(`await page.waitForLoadState('networkidle')`)
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

  it('falls back to this.page.waitForLoadState for networkidle in page object', () => {
    const page: IRPage = {
      name: 'Home',
      className: 'HomePage',
      normalizedUrl: '/',
      elements: [],
      steps: [{ id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 10_000 } }],
    }
    const out = renderPageObject(page)
    expect(out).toContain(`await this.page.waitForLoadState('networkidle')`)
  })
})
