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

describe('selenium-java wait rendering', () => {
  it('falls back to body presence for networkidle', () => {
    const scenario: IRScenario = {
      name: 'flow',
      pages: [
        pageWith([
          { id: 'n1', action: 'navigate', url: '/' },
          { id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 8000 } },
        ]),
      ],
    }
    const out = renderScenario(scenario)
    expect(out).toContain('// networkidle has no direct Selenium equivalent')
    expect(out).toContain(
      'wait.until(ExpectedConditions.presenceOfElementLocated(By.tagName("body")));',
    )
  })

  it('emits invisibilityOfElementLocated for spinner waits', () => {
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
    expect(out).toContain('ExpectedConditions.invisibilityOfElementLocated(')
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

describe('selenium-java wait rendering — page object methods', () => {
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
        wait: { reason: 'spinner', timeoutMs: 7000 },
      }),
    )
    expect(
      out.indexOf('wait.until(ExpectedConditions.invisibilityOf(loadingSpinner));'),
    ).toBeGreaterThan(out.indexOf('elementToBeClickable(saveButton)'))
  })

  it('waits for an element to become visible', () => {
    const out = renderPageObject(
      methodPage({
        id: 'w1',
        action: 'wait',
        element: spinnerEl,
        wait: { reason: 'element-visible', timeoutMs: 7000 },
      }),
    )
    expect(out).toContain('wait.until(ExpectedConditions.visibilityOf(loadingSpinner));')
  })
})
