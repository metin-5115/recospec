import { describe, it, expect } from 'vitest'
import { renderScenario } from './scenario'
import { renderPageObject } from './page-object'
import { inferMethods } from '../../planner/method-inferer'
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

describe('cypress wait rendering', () => {
  it('renders networkidle via cy.intercept + cy.wait', () => {
    const scenario: IRScenario = {
      name: 'flow',
      pages: [
        pageWith([
          { id: 'n1', action: 'navigate', url: '/' },
          { id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 9000 } },
        ]),
      ],
    }
    const out = renderScenario(scenario)
    expect(out).toContain(`cy.intercept('**/*').as('netReq');`)
    expect(out).toContain(`cy.wait('@netReq', { timeout: 9000 });`)
  })

  it('renders spinner waits via .should("not.exist")', () => {
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
              wait: { reason: 'spinner', timeoutMs: 6000 },
            },
          ],
          [spinnerEl],
        ),
      ],
    }
    const out = renderScenario(scenario)
    expect(out).toContain(`.should('not.exist');`)
  })

  it('matches snapshot for combined wait reasons', () => {
    const scenario: IRScenario = {
      name: 'wait flow',
      pages: [
        pageWith(
          [
            { id: 'n1', action: 'navigate', url: '/' },
            { id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 8000 } },
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

describe('cypress wait rendering — page object methods', () => {
  const button: IRElement = {
    name: 'saveButton',
    locatorStrategy: 'testid',
    locatorValue: 'save',
    tagName: 'button',
  }

  function methodPage(wait: IRStep): IRPage {
    const steps: IRStep[] = [{ id: 'c1', action: 'click', element: button }, wait]
    return { ...pageWith(steps, [button, spinnerEl]), inferredMethods: inferMethods(steps) }
  }

  it('waits for a spinner to disappear after the click that starts it', () => {
    const out = renderPageObject(
      methodPage({
        id: 'w1',
        action: 'wait',
        element: spinnerEl,
        wait: { reason: 'spinner', timeoutMs: 6000 },
      }),
    )
    expect(out.indexOf("this.loadingSpinner().should('not.exist');")).toBeGreaterThan(
      out.indexOf('this.saveButton().click();'),
    )
  })

  it('waits for an element to become visible', () => {
    const out = renderPageObject(
      methodPage({
        id: 'w1',
        action: 'wait',
        element: spinnerEl,
        wait: { reason: 'element-visible', timeoutMs: 6000 },
      }),
    )
    expect(out).toContain("this.loadingSpinner().should('be.visible');")
  })

  it('has no idle-network wait to render (Cypress retries assertions on its own)', () => {
    const out = renderPageObject(
      methodPage({ id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 6000 } }),
    )
    expect(out).not.toContain('cy.wait')
  })
})
