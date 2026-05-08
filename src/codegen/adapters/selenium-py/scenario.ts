import type { IRScenario, IRStep, AssertionDetail, IRElement } from '../../ir/types'
import { renderLocatorTuple, pyStr } from './locator'

/** Snake-case for module file names: LoginPage → login_page. */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '')
}

function renderAssertion(d: AssertionDetail, el: IRElement | undefined, indent: string): string {
  const tuple = el ? renderLocatorTuple(el) : null
  switch (d.type) {
    case 'visible':
      if (!tuple) return `${indent}# assert visible (no element)`
      return `${indent}assert WebDriverWait(driver, 10).until(EC.visibility_of_element_located(${tuple})) is not None`
    case 'hidden':
      if (!tuple) return `${indent}# assert hidden (no element)`
      return `${indent}assert WebDriverWait(driver, 10).until(EC.invisibility_of_element_located(${tuple}))`
    case 'text': {
      if (!tuple) return `${indent}# assert text (no element)`
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert driver.find_element(*${tuple}).text == ${expected}`
    }
    case 'value': {
      if (!tuple) return `${indent}# assert value (no element)`
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert driver.find_element(*${tuple}).get_attribute('value') == ${expected}`
    }
    case 'attribute': {
      if (!tuple) return `${indent}# assert attribute (no element)`
      const attr = pyStr(d.attribute ?? '')
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert driver.find_element(*${tuple}).get_attribute(${attr}) == ${expected}`
    }
    case 'count': {
      if (!tuple) return `${indent}# assert count (no element)`
      const expected = Number(d.expected ?? 0)
      return `${indent}assert len(driver.find_elements(*${tuple})) == ${expected}`
    }
    case 'screenshot': {
      const name = (d.name ?? 'snapshot').replace(/[^A-Za-z0-9_-]/g, '_')
      return `${indent}driver.save_screenshot(${pyStr(`screenshots/${name}.png`)})  # TODO: integrate pixel-diff`
    }
  }
}

function renderStepInTest(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}driver.get(${pyStr(step.url)})`
  }
  if (step.action === 'click' && step.element) {
    const tuple = renderLocatorTuple(step.element)
    return `${indent}WebDriverWait(driver, 10).until(EC.element_to_be_clickable(${tuple})).click()`
  }
  if (step.action === 'fill' && step.element) {
    const tuple = renderLocatorTuple(step.element)
    return [
      `${indent}_el = WebDriverWait(driver, 10).until(EC.visibility_of_element_located(${tuple}))`,
      `${indent}_el.clear()`,
      `${indent}_el.send_keys(${pyStr(step.value ?? '')})`,
    ].join('\n')
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}driver.switch_to.active_element.send_keys(Keys.${step.key.toUpperCase()})`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      return renderAssertion(step.assertionDetail, step.element, indent)
    }
    return `${indent}# assert: ${step.annotation ?? ''}`
  }
  return ''
}

function testNameSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'flow'
  )
}

/** Escape a string for embedding inside a `"""..."""` docstring. */
function docstringSafe(value: string): string {
  return value.replace(/"""/g, '\\"\\"\\"')
}

export function renderScenario(scenario: IRScenario): string {
  const pageImports = scenario.pages
    .map((p) => `from pages.${toSnakeCase(p.className)} import ${p.className}`)
    .join('\n')

  const body = scenario.pages
    .flatMap((page) => page.steps.map((step) => renderStepInTest(step, '    ')).filter(Boolean))
    .join('\n')

  const safeBody = body || '    pass'
  const slug = testNameSlug(scenario.name)
  const docstring = `    """${docstringSafe(scenario.name || 'Recorded scenario')}."""`

  // Touch the imports so unused-import linters stay quiet — generated tests
  // typically refactor toward Page Object calls; this keeps the imports live
  // until that refactor lands.
  const pomReferences = scenario.pages.map((p) => `    _ = ${p.className}  # noqa: F841`).join('\n')
  const pomBlock = pomReferences ? `${pomReferences}\n` : ''

  return `from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
${pageImports}


def test_${slug}(driver):
${docstring}
${pomBlock}${safeBody}
`
}
