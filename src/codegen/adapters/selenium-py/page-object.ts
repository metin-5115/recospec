import type {
  IRPage,
  IRElement,
  IRStep,
  InferredMethod,
  AssertionDetail,
  IRParamType,
  TestDataConfig,
} from '../../ir/types'
import { renderLocatorTuple, renderFallbackTuple, pyStr } from './locator'
import { resolveTestData } from '../../planner/test-data-resolver'

let TEST_DATA: TestDataConfig | undefined
export function setSeleniumPyPageObjectTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

function renderFillValueExpr(el: IRElement | undefined, recordedValue: string): string {
  const r = resolveTestData(el, recordedValue, TEST_DATA)
  if (!r.useEnvVar) return pyStr(r.literal)
  return `os.environ.get(${pyStr(r.envVarName)}, ${pyStr(r.defaultValue)})`
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

/** Convert a camelCase IR element name to UPPER_SNAKE_CASE for class constants. */
export function toConstName(name: string): string {
  const snake = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase()
  return snake.replace(/^_+|_+$/g, '') || 'EL'
}

const PARAM_SUFFIX_REGEX = /Input$|Button$|Btn$|Link$|Select$|Field$|Box$|Toggle$|Checkbox$|Radio$/

function paramSlugFromElement(name: string): string {
  const stripped = name.replace(PARAM_SUFFIX_REGEX, '')
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}

function pyType(t: IRParamType | undefined): string {
  if (t === 'number') return 'float'
  if (t === 'boolean') return 'bool'
  return 'str'
}

// ---------------------------------------------------------------------------
// Class-level locator constants
// ---------------------------------------------------------------------------

function renderLocatorConstant(el: IRElement): string {
  const constName = toConstName(el.name)
  const tuple = renderLocatorTuple(el)
  const lines: string[] = []
  if (el.shadowClosed) {
    lines.push(`    # WARNING: element is inside a closed shadow root — locator may be unreliable`)
  }
  if (el.frameContext?.frameChain.length) {
    lines.push(
      `    # WARNING: element is inside an iframe (${el.frameContext.frameChain.join(' > ')}) — switch_to.frame() before use`,
    )
  }
  lines.push(`    ${constName} = ${tuple}`)
  if (el.fallbackLocators?.length) {
    const exprs = el.fallbackLocators.map(renderFallbackTuple).join(', ')
    lines.push(`    # Fallbacks: ${exprs}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------

function renderAssertion(d: AssertionDetail, el: IRElement | undefined, indent: string): string {
  const constRef = el ? `self.${toConstName(el.name)}` : null
  switch (d.type) {
    case 'visible':
      if (!constRef) return `${indent}# assert visible (no element)`
      return `${indent}assert self.wait.until(EC.visibility_of_element_located(${constRef})) is not None`
    case 'hidden':
      if (!constRef) return `${indent}# assert hidden (no element)`
      return `${indent}assert self.wait.until(EC.invisibility_of_element_located(${constRef}))`
    case 'text': {
      if (!constRef) return `${indent}# assert text (no element)`
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert self.driver.find_element(*${constRef}).text == ${expected}`
    }
    case 'text-contains': {
      if (!constRef) return `${indent}# assert text contains (no element)`
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert ${expected} in self.driver.find_element(*${constRef}).text`
    }
    case 'value': {
      if (!constRef) return `${indent}# assert value (no element)`
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert self.driver.find_element(*${constRef}).get_attribute('value') == ${expected}`
    }
    case 'attribute': {
      if (!constRef) return `${indent}# assert attribute (no element)`
      const attr = pyStr(d.attribute ?? '')
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert self.driver.find_element(*${constRef}).get_attribute(${attr}) == ${expected}`
    }
    case 'count': {
      if (!constRef) return `${indent}# assert count (no element)`
      const expected = Number(d.expected ?? 0)
      return `${indent}assert len(self.driver.find_elements(*${constRef})) == ${expected}`
    }
    case 'screenshot': {
      // Selenium has no built-in pixel-diff. Emit a save-screenshot stub for the user.
      const name = (d.name ?? 'snapshot').replace(/[^A-Za-z0-9_-]/g, '_')
      return `${indent}self.driver.save_screenshot(${pyStr(`screenshots/${name}.png`)})  # TODO: integrate pixel-diff (e.g. needle / pytest-playwright-snapshot)`
    }
  }
}

function renderStepInMethod(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}self.driver.get(${pyStr(step.url)})`
  }
  if (step.action === 'click' && step.element) {
    const ref = `self.${toConstName(step.element.name)}`
    return `${indent}self.wait.until(EC.element_to_be_clickable(${ref})).click()`
  }
  if (step.action === 'fill' && step.element) {
    const ref = `self.${toConstName(step.element.name)}`
    const elField = `self.wait.until(EC.visibility_of_element_located(${ref}))`
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return `${indent}_el = ${elField}\n${indent}_el.clear()\n${indent}_el.send_keys(${expr})`
  }
  if (step.action === 'keypress' && step.key) {
    const keyConst = step.key.toUpperCase()
    return `${indent}self.driver.switch_to.active_element.send_keys(Keys.${keyConst})`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      return renderAssertion(step.assertionDetail, step.element, indent)
    }
    return `${indent}# assert: ${step.annotation ?? ''}`
  }
  // network mocking is not supported in Selenium core
  return ''
}

// ---------------------------------------------------------------------------
// Inferred methods
// ---------------------------------------------------------------------------

function renderInferredMethod(method: InferredMethod): string {
  const types = method.paramTypes ?? method.params.map(() => 'string' as IRParamType)
  const params = method.params.map((p, i) => `${p}: ${pyType(types[i])}`).join(', ')
  const signature = params ? `, ${params}` : ''

  const body = method.steps
    .map((s) => {
      if (s.action === 'fill' && s.element) {
        const slug = paramSlugFromElement(s.element.name)
        const idx = method.params.findIndex((p) => p === slug)
        if (idx !== -1) {
          const ref = `self.${toConstName(s.element.name)}`
          const paramName = method.params[idx]
          const valueExpr = types[idx] === 'string' ? paramName : `str(${paramName})`
          return [
            `        _el = self.wait.until(EC.visibility_of_element_located(${ref}))`,
            `        _el.clear()`,
            `        _el.send_keys(${valueExpr})`,
          ].join('\n')
        }
      }
      return renderStepInMethod(s, '        ')
    })
    .filter(Boolean)
    .join('\n')

  return `    def ${method.name}(self${signature}):\n${body || '        pass'}`
}

// ---------------------------------------------------------------------------
// Page Object class
// ---------------------------------------------------------------------------

export function renderPageObject(page: IRPage): string {
  const constants = page.elements.map(renderLocatorConstant).join('\n\n')

  const gotoStep = page.steps.find((s) => s.action === 'navigate')
  const gotoUrl = gotoStep?.url ?? '/'

  let methodsBlock = ''
  if (page.inferredMethods?.length) {
    methodsBlock = '\n\n' + page.inferredMethods.map(renderInferredMethod).join('\n\n')
  } else {
    const stepLines = page.steps
      .filter((s) => s.action !== 'navigate')
      .map((s) => renderStepInMethod(s, '        '))
      .filter(Boolean)
      .join('\n')
    if (stepLines) {
      methodsBlock = `\n\n    def perform_steps(self):\n${stepLines}`
    }
  }

  const collisionComment = page.collisionWarning
    ? `    # WARNING: Multiple pages share this URL pattern (${page.normalizedUrl}) with different titles.\n`
    : ''

  const constantsBlock = constants ? `${constants}\n\n` : ''

  const needsOsImport = (TEST_DATA?.params ?? []).some((p) => p.useEnvVar)
  const osImportLine = needsOsImport ? 'import os\n' : ''

  return `${osImportLine}from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class ${page.className}:
${collisionComment}${constantsBlock}    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 10)

    def goto(self):
        self.driver.get(${pyStr(gotoUrl)})${methodsBlock}
`
}
