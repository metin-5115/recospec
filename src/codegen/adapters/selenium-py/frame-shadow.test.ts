import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { validatePythonSource } from './python-validate'
import { inferMethods } from '../../planner/method-inferer'
import type { IRElement, IRPage, IRScenario, IRStep } from '../../ir/types'

const plain: IRElement = {
  name: 'plainBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="plain"]',
  tagName: 'button',
}

const framed: IRElement = {
  name: 'payBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="pay"]',
  tagName: 'button',
  frameContext: { frameChain: ['iframe[name="checkout"]', 'iframe#card'] },
}

const shadowed: IRElement = {
  name: 'saveBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="save"]',
  tagName: 'button',
  shadowContext: { hostChain: ['my-card', 'x-footer'] },
}

const shadowedXPath: IRElement = {
  name: 'ghostBtn',
  locatorStrategy: 'xpath',
  locatorValue: '//button[2]',
  tagName: 'button',
  shadowContext: { hostChain: ['my-card'] },
}

function pageWith(steps: IRStep[], elements: IRElement[]): IRPage {
  return {
    name: 'Checkout',
    className: 'CheckoutPage',
    normalizedUrl: '/checkout',
    elements,
    steps: [{ id: 'nav', action: 'navigate', url: '/checkout' }, ...steps],
    inferredMethods: inferMethods(steps),
  }
}

function expectValidPython(source: string): void {
  const result = validatePythonSource(source)
  expect(result.ok, result.error).toBe(true)
}

describe('selenium-py — iframes', () => {
  it('switches into the frame chain before using a framed element', () => {
    const out = renderPageObject(
      pageWith([{ id: 's', action: 'click', element: framed }], [framed]),
    )
    expect(out).toContain(`self._enter_frames('iframe[name="checkout"]', 'iframe#card')`)
    expect(out.indexOf('_enter_frames(')).toBeLessThan(out.indexOf('.click()'))
    expectValidPython(out)
  })

  it('emits the _enter_frames helper only when a frame is used', () => {
    const withFrame = renderPageObject(
      pageWith([{ id: 's', action: 'click', element: framed }], [framed]),
    )
    expect(withFrame).toContain('def _enter_frames(self, *selectors):')
    expect(withFrame).toContain('self.driver.switch_to.default_content()')
    const without = renderPageObject(
      pageWith([{ id: 's', action: 'click', element: plain }], [plain]),
    )
    expect(without).not.toContain('_enter_frames')
  })

  it('returns to the top document before a step outside the frame', () => {
    const steps: IRStep[] = [
      { id: 's1', action: 'click', element: framed },
      { id: 's2', action: 'click', element: plain },
    ]
    const out = renderPageObject(pageWith(steps, [framed, plain]))
    const afterFrame = out.slice(out.indexOf('.click()') + 1)
    expect(afterFrame).toContain('self.driver.switch_to.default_content()')
    expectValidPython(out)
  })

  it('does not insert a default_content switch when no frame was entered', () => {
    const out = renderPageObject(
      pageWith(
        [
          { id: 's1', action: 'click', element: plain },
          { id: 's2', action: 'click', element: plain },
        ],
        [plain],
      ),
    )
    expect(out).not.toContain('switch_to')
  })

  it('renders the same switch in a test function', () => {
    const scenario: IRScenario = {
      name: 'Pay',
      pages: [pageWith([{ id: 's', action: 'click', element: framed }], [framed])],
    }
    const out = renderScenario(scenario)
    expect(out).toContain(`_enter_frames(driver, 'iframe[name="checkout"]', 'iframe#card')`)
    expect(out).toContain('def _enter_frames(driver, *selectors):')
    expectValidPython(out)
  })
})

describe('selenium-py — shadow DOM', () => {
  it('resolves the element through the shadow roots of its host chain', () => {
    const out = renderPageObject(
      pageWith([{ id: 's', action: 'click', element: shadowed }], [shadowed]),
    )
    expect(out).toContain(`self.driver = self._shadow_root('my-card', 'x-footer')`)
    expect(out).toContain('self.wait = WebDriverWait(self.driver, 10)')
    expect(out).toContain('finally:')
    expect(out).toContain('def _shadow_root(self, *hosts):')
    expect(out).toContain('.shadow_root')
    expectValidPython(out)
  })

  it('restores driver and wait in the finally block', () => {
    const out = renderPageObject(
      pageWith([{ id: 's', action: 'click', element: shadowed }], [shadowed]),
    )
    expect(out).toContain('_outer_driver, _outer_wait = self.driver, self.wait')
    expect(out).toContain('self.driver, self.wait = _outer_driver, _outer_wait')
  })

  it('warns that an XPath locator cannot pierce a shadow root', () => {
    const out = renderPageObject(
      pageWith([{ id: 's', action: 'click', element: shadowedXPath }], [shadowedXPath]),
    )
    expect(out).toContain('XPath cannot pierce a shadow root')
  })

  it('leaves light-DOM elements completely untouched', () => {
    const out = renderPageObject(pageWith([{ id: 's', action: 'click', element: plain }], [plain]))
    expect(out).not.toContain('_shadow_root')
    expect(out).not.toContain('try:')
  })

  it('rebinds and restores the driver in a test function', () => {
    const scenario: IRScenario = {
      name: 'Save',
      pages: [pageWith([{ id: 's', action: 'click', element: shadowed }], [shadowed])],
    }
    const out = renderScenario(scenario)
    expect(out).toContain('_outer_driver = driver')
    expect(out).toContain(`driver = _shadow_root(driver, 'my-card', 'x-footer')`)
    expect(out).toContain('driver = _outer_driver')
    expect(out).toContain('def _shadow_root(driver, *hosts):')
    expectValidPython(out)
  })
})
