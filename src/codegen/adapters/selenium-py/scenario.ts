import type { IRPage, IRScenario, IRStep } from '../../ir/types'
import { renderLocatorTuple, pyStr } from './locator'
import { renderPyInteraction, pyInteractionImports } from './interaction'
import { renderPyAssertion } from './assertion'
import {
  newContextState,
  wrapStepContext,
  renderTestContextHelpers,
  type PyContextState,
} from './context'
import { renderNetworkNote } from './network-note'
import {
  renderScreenshotHelper,
  screenshotStdlibImports,
  screenshotThirdPartyImports,
} from './screenshot'
import { resolveTestData } from '../../planner/test-data-resolver'
import { renderFillValueExpr } from './fill-value'
import type { RenderOptions } from '../registry'
import {
  buildScenarioFlow,
  initialUrl,
  navigationTarget,
  pagesUsed,
  recordedOrigin,
  routeWithin,
  type FlowArg,
  type FlowItem,
} from '../../shared/scenario-flow'
import { toPyIdentifier, toSnakeCase } from './naming'
import { pyUrlExpr } from './base-url'
import { dottedModule, resolveOutputDirs } from '../../export/output-layout'

export { toSnakeCase }

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

function renderStepInTest(
  step: IRStep,
  page: IRPage,
  indent: string,
  options: RenderOptions,
): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}driver.get(${pyUrlExpr('driver', options.baseUrl, navigationTarget(options.baseUrl, page, step.url))})`
  }
  if (step.action === 'click' && step.element) {
    const tuple = renderLocatorTuple(step.element)
    return `${indent}WebDriverWait(driver, 10).until(EC.element_to_be_clickable(${tuple})).click()`
  }
  if (step.action === 'fill' && step.element) {
    const tuple = renderLocatorTuple(step.element)
    const expr = renderFillValueExpr(step.element, step.value ?? '', options.testData)
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
      return renderPyAssertion(
        step.assertionDetail,
        {
          driver: 'driver',
          wait: 'WebDriverWait(driver, 10)',
          locator: step.element ? renderLocatorTuple(step.element) : null,
        },
        indent,
      )
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

function renderArg(arg: FlowArg, options: RenderOptions): string {
  if (arg.fromFill && resolveTestData(arg.element, arg.value, options.testData).useEnvVar) {
    return renderFillValueExpr(arg.element, arg.value, options.testData)
  }
  switch (arg.type) {
    case 'boolean':
      return arg.value === 'true' ? 'True' : 'False'
    case 'number':
      return String(Number.isFinite(Number(arg.value)) ? Number(arg.value) : 0)
    default:
      // A date arrives as the label the page rendered (see the template accessor in the page object).
      return pyStr(arg.value)
  }
}

function renderItem(
  item: FlowItem,
  indent: string,
  contextState: PyContextState,
  options: RenderOptions,
): string[] {
  switch (item.kind) {
    case 'visit':
      return [
        `${indent}driver.get(${pyUrlExpr('driver', options.baseUrl, routeWithin(options.baseUrl, item.url))})`,
      ]
    case 'call': {
      const args = item.args.map((a) => renderArg(a, options)).join(', ')
      const receiver = toSnakeCase(item.page.className)
      return [`${indent}${receiver}.${toPyIdentifier(item.method.name)}(${args})`]
    }
    case 'inline':
      return item.page.steps
        .map((step) =>
          wrapStepContext(
            step,
            renderStepInTest(step, item.page, indent, options),
            indent,
            contextState,
            'test',
          ),
        )
        .filter(Boolean)
  }
}

export function renderScenario(scenario: IRScenario, given: RenderOptions = {}): string {
  // Routes are written relative to the origin the flow was recorded on, unless the caller pinned one.
  const options: RenderOptions = { ...given, baseUrl: given.baseUrl ?? recordedOrigin(scenario) }
  const flow = buildScenarioFlow(scenario)
  const used = pagesUsed(flow)
  const inlineSteps = flow.flatMap((item) => (item.kind === 'inline' ? item.page.steps : []))
  const hasInline = flow.some((item) => item.kind === 'inline')

  const pagesModule = dottedModule(resolveOutputDirs('selenium-py', options.dirs).pages)
  const pageImports = used
    .map((p) => `from ${pagesModule}.${toSnakeCase(p.className)} import ${p.className}`)
    .join('\n')

  const indent = '    '
  const start = initialUrl(scenario, flow)
  const opening = start
    ? [
        `${indent}driver.get(${pyUrlExpr('driver', options.baseUrl, routeWithin(options.baseUrl, start))})`,
      ]
    : []
  const pageObjects = used.map(
    (p) => `${indent}${toSnakeCase(p.className)} = ${p.className}(driver)`,
  )
  const contextState = newContextState()
  const body = [
    ...opening,
    ...pageObjects,
    ...flow.flatMap((item) => renderItem(item, indent, contextState, options)),
  ].join('\n')

  const helpers = [renderTestContextHelpers(inlineSteps), renderScreenshotHelper(inlineSteps)]
    .filter(Boolean)
    .join('\n\n\n')
  const helpersBlock = helpers ? `${helpers}\n\n\n` : ''

  const networkNote = renderNetworkNote(
    scenario.pages.flatMap((p) => p.steps),
    indent,
    options,
  )
  const safeBody = (networkNote + body).trimEnd() || '    pass'
  const slug = testNameSlug(scenario.name)
  const docstring = `    """${docstringSafe(scenario.name || 'Recorded scenario')}."""`

  const needsOsImport = /\bos\.environ\b/.test(body)
  const needsReImport = inlineSteps.some((s) => s.assertionDetail?.type === 'matches')
  const stdlibImports = [
    needsReImport ? 'import re' : '',
    needsOsImport ? 'import os' : '',
    ...screenshotStdlibImports(inlineSteps),
  ].filter(Boolean)
  const stdlibBlock = stdlibImports.length ? stdlibImports.join('\n') + '\n' : ''
  // Inline steps drive the browser themselves; a spec that only calls page objects needs none of these.
  const seleniumImports = hasInline
    ? `from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
${pyInteractionImports(inlineSteps)}${screenshotThirdPartyImports(inlineSteps)}`
    : ''

  const imports = `${stdlibBlock}${seleniumImports}${pageImports}`.trimEnd()

  return `${imports}


${helpersBlock}def test_${slug}(driver):
${docstring}
${safeBody}
`
}
