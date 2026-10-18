import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { inferMethods } from '../../planner/method-inferer'
import type { IRElement, IRPage, IRScenario, IRStep } from '../../ir/types'

function el(name: string, tagName: string, inputType?: string): IRElement {
  return {
    name,
    locatorStrategy: 'testid',
    locatorValue: `[data-testid="${name}"]`,
    tagName,
    inputType,
  }
}

const country = el('countrySelect', 'select')
const terms = el('termsCheckbox', 'input', 'checkbox')
const menu = el('accountMenu', 'div')
const row = el('rowItem', 'tr')
const submit = el('submitBtn', 'button')

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

describe('cypress adapter — select / check / hover / dblclick', () => {
  it('renders a lone select as a parameterised .select(param) method', () => {
    const page = pageWith(
      [{ id: 's1', action: 'select', element: country, value: 'tr' }],
      [country],
    )
    const out = renderPageObject(page)
    expect(out).toContain('selectCountry(country)')
    expect(out).toContain('this.countrySelect().select(country);')
  })

  it('renders check, uncheck, hover and dblclick', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'check', element: terms },
        { id: 's2', action: 'uncheck', element: terms },
        { id: 's3', action: 'hover', element: menu },
        { id: 's4', action: 'dblclick', element: row },
      ],
      [terms, menu, row],
    )
    const out = renderPageObject(page)
    expect(out).toContain('this.termsCheckbox().check();')
    expect(out).toContain('this.termsCheckbox().uncheck();')
    expect(out).toContain(`this.accountMenu().trigger('mouseover');`)
    expect(out).toContain('this.rowItem().dblclick();')
  })

  it('branches on the boolean param inside acceptAndSubmit', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'check', element: terms },
        { id: 's2', action: 'click', element: submit },
      ],
      [terms, submit],
    )
    const out = renderPageObject(page)
    expect(out).toContain('acceptAndSubmit(terms)')
    expect(out).toContain('if (terms) {')
    expect(out).toContain('this.termsCheckbox().check();')
    expect(out).toContain('this.termsCheckbox().uncheck();')
  })

  it('calls the page-object methods for the new actions in spec scope', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'select', element: country, value: 'tr' },
        { id: 's2', action: 'check', element: terms },
        { id: 's3', action: 'hover', element: menu },
        { id: 's4', action: 'dblclick', element: row },
      ],
      [country, terms, menu, row],
    )
    const spec = renderScenario({ name: 'Checkout flow', pages: [page] })
    expect(spec).toContain('checkoutPage.selectCountry("tr");')
    expect(spec).toContain('checkoutPage.checkTerms();')
    expect(spec).toContain('checkoutPage.hoverAccountMenu();')
    expect(spec).toContain('checkoutPage.doubleClickRowItem();')
    expect(spec).not.toContain('cy.get(')
  })

  it('renders the new actions inline for a page with no inferred methods', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'select', element: country, value: 'tr' },
        { id: 's2', action: 'check', element: terms },
        { id: 's3', action: 'hover', element: menu },
        { id: 's4', action: 'dblclick', element: row },
      ],
      [country, terms, menu, row],
    )
    const scenario: IRScenario = {
      name: 'Checkout flow',
      pages: [{ ...page, inferredMethods: undefined }],
    }
    const spec = renderScenario(scenario)
    expect(spec).toContain('.select("tr");')
    expect(spec).toContain('.check();')
    expect(spec).toContain(`.trigger('mouseover');`)
    expect(spec).toContain('.dblclick();')
  })
})
