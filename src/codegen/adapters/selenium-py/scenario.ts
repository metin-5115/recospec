import type { IRScenario, IRStep, AssertionDetail, IRElement, TestDataConfig } from '../../ir/types'
import { renderLocatorTuple, pyStr } from './locator'
import { renderPyInteraction, pyInteractionImports } from './interaction'
import { newContextState, wrapStepContext, renderTestContextHelpers } from './context'
import { renderNetworkNote } from './network-note'
import {
  DEFAULT_SCREENSHOT_THRESHOLD,
  renderScreenshotHelper,
  screenshotName,
  screenshotStdlibImports,
  screenshotThirdPartyImports,
} from './screenshot'
import { resolveTestData } from '../../planner/test-data-resolver'

let TEST_DATA: TestDataConfig | undefined
export function setSeleniumPyTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

function renderFillValueExpr(el: IRElement | undefined, recordedValue: string): string {
  const r = resolveTestData(el, recordedValue, TEST_DATA)
  if (!r.useEnvVar) return pyStr(r.literal)
  return `os.environ.get(${pyStr(r.envVarName)}, ${pyStr(r.defaultValue)})`
}

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
    case 'text-contains': {
      if (!tuple) return `${indent}# assert text contains (no element)`
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert ${expected} in driver.find_element(*${tuple}).text`
    }
    case 'not-empty': {
      if (!tuple) return `${indent}# assert not empty (no element)`
      return `${indent}assert driver.find_element(*${tuple}).text.strip() != ""`
    }
    case 'matches': {
      if (!tuple) return `${indent}# assert matches (no element)`
      const pattern = pyStr(String(d.expected ?? ''))
      return `${indent}assert re.search(${pattern}, driver.find_element(*${tuple}).text)`
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
      const name = pyStr(screenshotName(d.name))
      return `${indent}_assert_screenshot(driver, ${name}, ${d.threshold ?? DEFAULT_SCREENSHOT_THRESHOLD})`
    }
  }
}

function renderWait(step: IRStep, indent: string): string {
  if (!step.wait) return ''
  // Selenium has no native networkidle; degrade to a presence check on body.
  // For spinner / element-hidden / element-visible we use WebDriverWait.
  const timeoutSec = Math.max(1, Math.round(step.wait.timeoutMs / 1000))
  if (step.wait.reason === 'networkidle') {
    return [
      `${indent}# networkidle has no direct Selenium equivalent — wait until DOM is settled.`,
      `${indent}WebDriverWait(driver, ${timeoutSec}).until(`,
      `${indent}    EC.presence_of_element_located((By.TAG_NAME, 'body'))`,
      `${indent})`,
    ].join('\n')
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return ''
    const tuple = renderLocatorTuple(step.element)
    return `${indent}WebDriverWait(driver, ${timeoutSec}).until(EC.invisibility_of_element_located(${tuple}))`
  }
  if (step.wait.reason === 'element-visible' && step.element) {
    const tuple = renderLocatorTuple(step.element)
    return `${indent}WebDriverWait(driver, ${timeoutSec}).until(EC.visibility_of_element_located(${tuple}))`
  }
  return ''
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
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return [
      `${indent}_el = WebDriverWait(driver, 10).until(EC.visibility_of_element_located(${tuple}))`,
      `${indent}_el.clear()`,
      `${indent}_el.send_keys(${expr})`,
    ].join('\n')
  }
  if (step.element) {
    const tuple = renderLocatorTuple(step.element)
    const elementExpr = `WebDriverWait(driver, 10).until(EC.visibility_of_element_located(${tuple}))`
    const interaction = renderPyInteraction(step, elementExpr, 'driver', indent)
    if (interaction) return interaction
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}driver.switch_to.active_element.send_keys(Keys.${step.key.toUpperCase()})`
  }
  if (step.action === 'wait') {
    return renderWait(step, indent)
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

  const contextState = newContextState()
  const body = scenario.pages
    .flatMap((page) =>
      page.steps
        .map((step) =>
          wrapStepContext(step, renderStepInTest(step, '    '), '    ', contextState, 'test'),
        )
        .filter(Boolean),
    )
    .join('\n')
  const allSteps = scenario.pages.flatMap((p) => p.steps)
  const helpers = [renderTestContextHelpers(allSteps), renderScreenshotHelper(allSteps)]
    .filter(Boolean)
    .join('\n\n\n')
  const helpersBlock = helpers ? `${helpers}\n\n\n` : ''

  const networkNote = renderNetworkNote(
    scenario.pages.flatMap((p) => p.steps),
    '    ',
  )
  const safeBody = (networkNote + body).trimEnd() || '    pass'
  const slug = testNameSlug(scenario.name)
  const docstring = `    """${docstringSafe(scenario.name || 'Recorded scenario')}."""`

  // Touch the imports so unused-import linters stay quiet — generated tests
  // typically refactor toward Page Object calls; this keeps the imports live
  // until that refactor lands.
  const pomReferences = scenario.pages.map((p) => `    _ = ${p.className}  # noqa: F841`).join('\n')
  const pomBlock = pomReferences ? `${pomReferences}\n` : ''

  const interactionImports = pyInteractionImports(scenario.pages.flatMap((p) => p.steps))
  const needsOsImport = (TEST_DATA?.params ?? []).some((p) => p.useEnvVar)
  const needsReImport = scenario.pages.some((p) =>
    p.steps.some((s) => s.assertionDetail?.type === 'matches'),
  )
  const stdlibImports = [
    needsReImport ? 'import re' : '',
    needsOsImport ? 'import os' : '',
    ...screenshotStdlibImports(scenario.pages.flatMap((p) => p.steps)),
  ].filter(Boolean)
  const osImportLine = stdlibImports.length ? stdlibImports.join('\n') + '\n' : ''

  return `${osImportLine}from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
${interactionImports}${screenshotThirdPartyImports(scenario.pages.flatMap((p) => p.steps))}${pageImports}


${helpersBlock}def test_${slug}(driver):
${docstring}
${pomBlock}${safeBody}
`
}
