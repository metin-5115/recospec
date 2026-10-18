import { describe, it, expect } from 'vitest'
import { renderPageObject, renderScenario } from './index'
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

describe('playwright adapter — select / check / hover / dblclick', () => {
  it('renders a lone select as a parameterised selectOption method', () => {
    const page = pageWith(
      [{ id: 's1', action: 'select', element: country, value: 'tr' }],
      [country],
    )
    const out = renderPageObject(page)
    expect(out).toContain('async selectCountry(country: string)')
    expect(out).toContain('this.countrySelect.selectOption(country)')
  })

  it('renders check and uncheck', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'check', element: terms },
        { id: 's2', action: 'uncheck', element: terms },
      ],
      [terms],
    )
    const out = renderPageObject(page)
    expect(out).toContain('this.termsCheckbox.check()')
    expect(out).toContain('this.termsCheckbox.uncheck()')
  })

  it('renders hover and dblclick', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'hover', element: menu },
        { id: 's2', action: 'dblclick', element: row },
      ],
      [menu, row],
    )
    const out = renderPageObject(page)
    expect(out).toContain('this.accountMenu.hover()')
    expect(out).toContain('this.rowItem.dblclick()')
  })

  it('uses setChecked with the boolean param inside acceptAndSubmit', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'check', element: terms },
        { id: 's2', action: 'click', element: submit },
      ],
      [terms, submit],
    )
    const out = renderPageObject(page)
    expect(out).toContain('async acceptAndSubmit(terms: boolean)')
    expect(out).toContain('this.termsCheckbox.setChecked(terms)')
  })

  it('substitutes the select param when the method is parameterised', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'select', element: country, value: 'tr' },
        { id: 's2', action: 'click', element: submit },
      ],
      [country, submit],
    )
    const out = renderPageObject(page)
    expect(out).toMatch(/async \w+\(country: string\)/)
    expect(out).toContain('this.countrySelect.selectOption(country)')
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
    const scenario: IRScenario = { name: 'Checkout flow', pages: [page] }
    const spec = renderScenario(scenario)
    expect(spec).toContain('await checkoutPage.selectCountry("tr");')
    expect(spec).toContain('await checkoutPage.checkTerms();')
    expect(spec).toContain('await checkoutPage.hoverAccountMenu();')
    expect(spec).toContain('await checkoutPage.doubleClickRowItem();')
    expect(spec).not.toContain('getByTestId')
  })
})
