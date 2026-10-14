import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { validateJavaSource } from './java-validate'
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

function expectBalanced(source: string): void {
  const result = validateJavaSource(source)
  expect(result.ok, JSON.stringify(result.issues)).toBe(true)
}

describe('selenium-java adapter — select / check / hover / dblclick', () => {
  it('renders new Select(field).selectByValue(param) and imports Select', () => {
    const page = pageWith(
      [{ id: 's1', action: 'select', element: country, value: 'tr' }],
      [country],
    )
    const out = renderPageObject(page)
    expect(out).toContain('import org.openqa.selenium.support.ui.Select;')
    expect(out).toContain('public void selectCountry(String country)')
    expect(out).toContain('new Select(this.countrySelect).selectByValue(country);')
    expectBalanced(out)
  })

  it('renders check/uncheck guarded by isSelected()', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'check', element: terms },
        { id: 's2', action: 'uncheck', element: terms },
      ],
      [terms],
    )
    const out = renderPageObject(page)
    expect(out).toContain('if (!this.termsCheckbox.isSelected()) {')
    expect(out).toContain('if (this.termsCheckbox.isSelected()) {')
    expectBalanced(out)
  })

  it('renders hover and dblclick through Actions and imports it', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'hover', element: menu },
        { id: 's2', action: 'dblclick', element: row },
      ],
      [menu, row],
    )
    const out = renderPageObject(page)
    expect(out).toContain('import org.openqa.selenium.interactions.Actions;')
    expect(out).toContain('new Actions(driver).moveToElement(this.accountMenu).perform();')
    expect(out).toContain('new Actions(driver).doubleClick(this.rowItem).perform();')
    expectBalanced(out)
  })

  it('drives the checked state from the boolean param in acceptAndSubmit', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'check', element: terms },
        { id: 's2', action: 'click', element: submit },
      ],
      [terms, submit],
    )
    const out = renderPageObject(page)
    expect(out).toContain('public void acceptAndSubmit(boolean terms)')
    expect(out).toContain('if (this.termsCheckbox.isSelected() != terms) {')
    expectBalanced(out)
  })

  it('adds no extra imports when no such step is present', () => {
    const page = pageWith([{ id: 's1', action: 'click', element: submit }], [submit])
    const out = renderPageObject(page)
    expect(out).not.toContain('support.ui.Select;')
    expect(out).not.toContain('interactions.Actions;')
  })

  it('scopes each interaction in a block so repeated _el locals compile', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'check', element: terms },
        { id: 's2', action: 'select', element: country, value: 'tr' },
        { id: 's3', action: 'hover', element: menu },
        { id: 's4', action: 'dblclick', element: row },
      ],
      [terms, country, menu, row],
    )
    const scenario: IRScenario = { name: 'Checkout flow', pages: [page] }
    const spec = renderScenario(scenario)
    expect(spec).toContain('import org.openqa.selenium.interactions.Actions;')
    expect(spec).toContain('import org.openqa.selenium.support.ui.Select;')
    expect(spec).toContain('new Select(_el).selectByValue("tr");')
    expect(spec.match(/WebElement _el =/g)).toHaveLength(4)
    expect(spec.match(/^\s+\{$/gm)).toHaveLength(4)
    expectBalanced(spec)
  })
})
