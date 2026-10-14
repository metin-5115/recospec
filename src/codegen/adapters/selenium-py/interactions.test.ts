import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { validatePythonSource } from './python-validate'
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

function expectValidPython(source: string): void {
  // With no interpreter on PATH the validator reports ok + skipped (CI-safe).
  const result = validatePythonSource(source)
  expect(result.ok, result.error).toBe(true)
}

describe('selenium-py adapter — select / check / hover / dblclick', { timeout: 30_000 }, () => {
  it('renders a parameterised Select(...).select_by_value and imports Select', () => {
    const page = pageWith(
      [{ id: 's1', action: 'select', element: country, value: 'tr' }],
      [country],
    )
    const out = renderPageObject(page)
    expect(out).toContain('from selenium.webdriver.support.ui import Select\n')
    expect(out).toContain('def selectCountry(self, country: str):')
    expect(out).toContain(
      'Select(self.wait.until(EC.visibility_of_element_located(self.COUNTRY_SELECT))).select_by_value(country)',
    )
    expectValidPython(out)
  })

  it('renders check/uncheck guarded by is_selected()', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'check', element: terms },
        { id: 's2', action: 'uncheck', element: terms },
      ],
      [terms],
    )
    const out = renderPageObject(page)
    expect(out).toContain('if not _el.is_selected():')
    expect(out).toContain('if _el.is_selected():')
    expectValidPython(out)
  })

  it('renders hover and dblclick through ActionChains and imports it', () => {
    const page = pageWith(
      [
        { id: 's1', action: 'hover', element: menu },
        { id: 's2', action: 'dblclick', element: row },
      ],
      [menu, row],
    )
    const out = renderPageObject(page)
    expect(out).toContain('from selenium.webdriver.common.action_chains import ActionChains\n')
    expect(out).toContain('ActionChains(self.driver).move_to_element(_el).perform()')
    expect(out).toContain('ActionChains(self.driver).double_click(_el).perform()')
    expectValidPython(out)
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
    expect(out).toContain('def acceptAndSubmit(self, terms: bool):')
    expect(out).toContain('if _el.is_selected() != terms:')
    expectValidPython(out)
  })

  it('does not add the new imports when no such step is present', () => {
    const page = pageWith([{ id: 's1', action: 'click', element: submit }], [submit])
    const out = renderPageObject(page)
    expect(out).not.toContain('import Select')
    expect(out).not.toContain('ActionChains')
  })

  it('renders the new actions in the test function with the literal value', () => {
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
    expect(spec).toContain(".select_by_value('tr')")
    expect(spec).toContain('ActionChains(driver).move_to_element(_el).perform()')
    expect(spec).toContain('ActionChains(driver).double_click(_el).perform()')
    expect(spec).toContain('from selenium.webdriver.support.ui import Select\n')
    expectValidPython(spec)
  })
})
