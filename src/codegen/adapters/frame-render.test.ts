import { describe, it, expect } from 'vitest'
import type { IRPage, IRElement } from '../ir/types'
import { renderPageObject as renderPlaywrightPage } from './playwright-ts'
import { renderLocator as renderCypressLocator } from './cypress/locator'
import { renderPageObject as renderSeleniumPyPage } from './selenium-py/page-object'
import { renderPageObject as renderSeleniumJavaPage } from './selenium-java/page-object'

/**
 * Faz 3 acceptance — frame-chain render test. An element nested two iframes
 * deep must render the frame chain (outermost first) in every adapter, with
 * NO silent drop: a framework that cannot pierce iframes natively emits an
 * explanatory comment instead.
 */

const nestedFrameElement: IRElement = {
  name: 'payButton',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="pay"]',
  tagName: 'button',
  frameContext: {
    frameUrl: 'https://psp.example.com/widget',
    frameChain: ['iframe[name="checkout"]', 'iframe#card-form'],
  },
}

function pageWith(el: IRElement): IRPage {
  return {
    name: 'Checkout',
    className: 'CheckoutPage',
    normalizedUrl: 'https://shop.example.com/cart',
    steps: [{ id: 's1', action: 'navigate', url: 'https://shop.example.com/cart' }],
    elements: [el],
  }
}

describe('frame-chain rendering across frameworks', () => {
  it('Playwright chains frameLocator() outermost-first', () => {
    const code = renderPlaywrightPage(pageWith(nestedFrameElement))
    expect(code).toContain(
      'page.frameLocator("iframe[name=\\"checkout\\"]").frameLocator("iframe#card-form")',
    )
    expect(code).toContain('.getByTestId("pay")')
  })

  it('Cypress emits the frame chain (no silent drop)', () => {
    const code = renderCypressLocator(nestedFrameElement)
    expect(code).toContain('iframe[name="checkout"]')
    expect(code).toContain('iframe#card-form')
  })

  it('Selenium Python surfaces the iframe chain as a switch_to.frame caveat', () => {
    const code = renderSeleniumPyPage(pageWith(nestedFrameElement))
    expect(code).toContain('iframe[name="checkout"] > iframe#card-form')
    expect(code).toContain('switch_to.frame()')
  })

  it('Selenium Java surfaces the iframe chain as a switchTo().frame caveat', () => {
    const code = renderSeleniumJavaPage(pageWith(nestedFrameElement))
    expect(code).toContain('iframe[name="checkout"] > iframe#card-form')
    expect(code).toContain('driver.switchTo().frame(...)')
  })
})
