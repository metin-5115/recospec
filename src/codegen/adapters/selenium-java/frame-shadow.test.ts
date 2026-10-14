import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { validateJavaSource } from './java-validate'
import { renderByExpression } from './locator'
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

function expectBalanced(source: string): void {
  const result = validateJavaSource(source)
  expect(result.ok, JSON.stringify(result.issues)).toBe(true)
}

describe('selenium-java — iframes', () => {
  it('enters the frame chain before using a framed element', () => {
    const out = renderPageObject(
      pageWith([{ id: 's', action: 'click', element: framed }], [framed]),
    )
    expect(out).toContain('enterFrames("iframe[name=\\"checkout\\"]", "iframe#card");')
    expect(out.indexOf('enterFrames(')).toBeLessThan(out.indexOf('.click();'))
    expect(out).toContain('private void enterFrames(String... selectors) {')
    expect(out).toContain('driver.switchTo().defaultContent();')
    expectBalanced(out)
  })

  it('emits no frame helper when no frame is used', () => {
    const out = renderPageObject(pageWith([{ id: 's', action: 'click', element: plain }], [plain]))
    expect(out).not.toContain('enterFrames')
    expect(out).not.toContain('switchTo')
  })

  it('returns to the top document for a following step outside the frame', () => {
    const out = renderPageObject(
      pageWith(
        [
          { id: 's1', action: 'click', element: framed },
          { id: 's2', action: 'click', element: plain },
        ],
        [framed, plain],
      ),
    )
    const first = out.indexOf('.click();')
    expect(out.slice(first)).toContain('driver.switchTo().defaultContent();')
    expectBalanced(out)
  })

  it('does the same in a test class', () => {
    const scenario: IRScenario = {
      name: 'Pay',
      pages: [pageWith([{ id: 's', action: 'click', element: framed }], [framed])],
    }
    const out = renderScenario(scenario)
    expect(out).toContain('enterFrames(')
    expect(out).toContain('private void enterFrames(String... selectors) {')
    expectBalanced(out)
  })
})

describe('selenium-java — shadow DOM', () => {
  it('renders a ShadowBy locator for an element in a shadow root', () => {
    const by = renderByExpression(shadowed)
    expect(by).toBe(
      'new ShadowBy(new String[] {"my-card", "x-footer"}, By.cssSelector("[data-testid=\\"save\\"]"))',
    )
  })

  it('leaves a light-DOM locator as a plain By', () => {
    expect(renderByExpression(plain)).toBe('By.cssSelector("[data-testid=\\"plain\\"]")')
  })

  it('re-resolves the page-object field through ShadowBy before the step', () => {
    const out = renderPageObject(
      pageWith([{ id: 's', action: 'click', element: shadowed }], [shadowed]),
    )
    expect(out).toContain('this.saveBtn = driver.findElement(new ShadowBy(')
    expect(out).toContain('private static final class ShadowBy extends By {')
    expect(out).toContain('.getShadowRoot()')
    expect(out).toContain('import org.openqa.selenium.SearchContext;')
    expect(out).toContain('import java.util.List;')
    expectBalanced(out)
  })

  it('uses ShadowBy for by-based lookups in a test class', () => {
    const scenario: IRScenario = {
      name: 'Save',
      pages: [pageWith([{ id: 's', action: 'click', element: shadowed }], [shadowed])],
    }
    const out = renderScenario(scenario)
    expect(out).toContain('elementToBeClickable(new ShadowBy(')
    expect(out).toContain('private static final class ShadowBy extends By {')
    expectBalanced(out)
  })

  it('emits no ShadowBy class for light-DOM only output', () => {
    const out = renderPageObject(pageWith([{ id: 's', action: 'click', element: plain }], [plain]))
    expect(out).not.toContain('ShadowBy')
    expect(out).not.toContain('SearchContext')
  })
})
