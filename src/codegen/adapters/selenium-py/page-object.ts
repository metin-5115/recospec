import type { IRPage, IRElement, IRStep, InferredMethod, IRParamType } from '../../ir/types'
import { renderLocatorTuple, renderFallbackTuple, pyStr } from './locator'
import { renderPyInteraction, pyInteractionImports } from './interaction'
import { renderPyAssertion } from './assertion'
import { newContextState, wrapStepContext, renderPageContextHelpers } from './context'
import {
  renderScreenshotHelper,
  screenshotStdlibImports,
  screenshotThirdPartyImports,
} from './screenshot'
import { renderFillValueExpr } from './fill-value'
import type { RenderOptions } from '../registry'
import { absoluteUrl } from '../../shared/scenario-flow'
import { toPyIdentifier } from './naming'

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

/** Name of the method parameter an element feeds, in the same snake_case the signature uses. */
function paramSlugFromElement(name: string): string {
  const stripped = name.replace(PARAM_SUFFIX_REGEX, '')
  return toPyIdentifier(stripped.charAt(0).toLowerCase() + stripped.slice(1))
}

function pyType(t: IRParamType | undefined): string {
  if (t === 'number') return 'float'
  if (t === 'boolean') return 'bool'
  return 'str'
}

// ---------------------------------------------------------------------------
// Class-level locator constants
// ---------------------------------------------------------------------------

/** snake_case method name for a template element's parameterized accessor. */
function toSnakeName(name: string): string {
  return toConstName(name).toLowerCase()
}

/**
 * Parameterized accessor for a template element (param mode).
 *
 * ASSUMPTION: the Selenium adapters take the PRE-FORMATTED accessible label as
 * a string parameter — Python cannot format locale-aware month/weekday names
 * without extra dependencies (babel), so the date→label formatting stays on
 * the caller's side. The expected pattern + locale are documented inline.
 */
function renderTemplateAccessor(el: IRElement): string {
  const t = el.template!
  const scopePrefix = t.scope?.xpath ?? ''
  const tag = el.tagName?.toLowerCase() || '*'
  const meta =
    t.kind === 'date'
      ? `        # Template: ${t.nameTemplate} — pass the label formatted as '${t.pattern ?? ''}' (locale ${t.localeId ?? 'en-US'}).`
      : `        # Template: ${t.nameTemplate} — pass the visible value as rendered by the UI.`
  const param = t.kind === 'date' ? 'date' : 'value'
  const xpathExpr = `f'${scopePrefix}//${tag}[normalize-space()="{${param}}"]'`
  return [
    `    def ${toSnakeName(el.name)}(self, ${param}: str):`,
    meta,
    `        return self.wait.until(EC.presence_of_element_located((By.XPATH, ${xpathExpr})))`,
  ].join('\n')
}

function renderLocatorConstant(el: IRElement): string {
  const constName = toConstName(el.name)
  const tuple = renderLocatorTuple(el)
  const lines: string[] = []
  if (el.locatorStrategy === 'template' && el.template) {
    const mode = el.templateParamMode ?? 'param'
    if (mode === 'param') {
      lines.push(
        `    # Template: ${el.template.nameTemplate} — see ${toSnakeName(el.name)}() for the parameterized accessor`,
      )
    } else if (mode === 'relative') {
      lines.push(
        `    # NOTE: relative date mode is not available in the Selenium Python adapter — the date stays frozen at the recorded value`,
      )
    }
  }
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

function renderStepInMethod(step: IRStep, indent: string, options: RenderOptions): string {
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
    const expr = renderFillValueExpr(step.element, step.value ?? '', options.testData)
    return `${indent}_el = ${elField}\n${indent}_el.clear()\n${indent}_el.send_keys(${expr})`
  }
  if (step.element) {
    const interaction = renderPyInteraction(
      step,
      visibleElementExpr(step.element),
      'self.driver',
      indent,
    )
    if (interaction) return interaction
  }
  if (step.action === 'keypress' && step.key) {
    const keyConst = step.key.toUpperCase()
    return `${indent}self.driver.switch_to.active_element.send_keys(Keys.${keyConst})`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      return renderPyAssertion(
        step.assertionDetail,
        {
          driver: 'self.driver',
          wait: 'self.wait',
          locator: step.element ? `self.${toConstName(step.element.name)}` : null,
        },
        indent,
      )
    }
    return `${indent}# assert: ${step.annotation ?? ''}`
  }
  if (step.action === 'wait' && step.wait && step.element) {
    const seconds = Math.max(1, Math.round(step.wait.timeoutMs / 1000))
    const ref = `self.${toConstName(step.element.name)}`
    if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
      return `${indent}WebDriverWait(self.driver, ${seconds}).until(EC.invisibility_of_element_located(${ref}))`
    }
    if (step.wait.reason === 'element-visible') {
      return `${indent}WebDriverWait(self.driver, ${seconds}).until(EC.visibility_of_element_located(${ref}))`
    }
  }
  // network mocking is not supported in Selenium core
  return ''
}

/** Explicit-wait expression yielding the page-object element once it is visible. */
function visibleElementExpr(el: IRElement): string {
  return `self.wait.until(EC.visibility_of_element_located(self.${toConstName(el.name)}))`
}

// ---------------------------------------------------------------------------
// Inferred methods
// ---------------------------------------------------------------------------

function renderInferredMethod(inferred: InferredMethod, options: RenderOptions): string {
  const method: InferredMethod = {
    ...inferred,
    name: toPyIdentifier(inferred.name),
    params: inferred.params.map(toPyIdentifier),
  }
  const types = method.paramTypes ?? method.params.map(() => 'string' as IRParamType)
  const params = method.params.map((p, i) => `${p}: ${pyType(types[i])}`).join(', ')
  const signature = params ? `, ${params}` : ''

  const contextState = newContextState()
  const renderOne = (s: IRStep): string | null => {
    // A click on a template element receives the formatted label as a parameter.
    if (s.action === 'click' && s.element?.template) {
      const param = s.element.template.kind === 'date' ? 'date' : 'value'
      const idx = method.params.indexOf(param)
      if (idx !== -1) {
        return `        self.${toSnakeName(s.element.name)}(${method.params[idx]}).click()`
      }
    }
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
    if (s.action === 'select' && s.element) {
      const idx = method.params.findIndex((p) => p === paramSlugFromElement(s.element!.name))
      if (idx !== -1) {
        const paramName = method.params[idx]!
        const selectArg = types[idx] === 'string' ? paramName : `str(${paramName})`
        return renderPyInteraction(s, visibleElementExpr(s.element), 'self.driver', '        ', {
          selectArg,
        })
      }
    }
    if ((s.action === 'check' || s.action === 'uncheck') && s.element) {
      const idx = method.params.findIndex(
        (p, i) => types[i] === 'boolean' && p === paramSlugFromElement(s.element!.name),
      )
      if (idx !== -1) {
        return renderPyInteraction(s, visibleElementExpr(s.element), 'self.driver', '        ', {
          toggleParam: method.params[idx],
        })
      }
    }
    return renderStepInMethod(s, '        ', options)
  }
  const body = method.steps
    .map((s) => wrapStepContext(s, renderOne(s), '        ', contextState, 'page'))
    .filter(Boolean)
    .join('\n')

  return `    def ${method.name}(self${signature}):\n${body || '        pass'}`
}

// ---------------------------------------------------------------------------
// Page Object class
// ---------------------------------------------------------------------------

export function renderPageObject(page: IRPage, options: RenderOptions = {}): string {
  const constants = page.elements.map(renderLocatorConstant).join('\n\n')

  const gotoStep = page.steps.find((s) => s.action === 'navigate')
  // Selenium has no base URL, so the route is completed with the origin the session ran on.
  const gotoUrl = absoluteUrl(page.baseUrl, gotoStep?.url ?? page.normalizedUrl)

  const templateAccessors = page.elements
    .filter(
      (el) =>
        el.locatorStrategy === 'template' &&
        el.template &&
        (el.templateParamMode ?? 'param') === 'param',
    )
    .map(renderTemplateAccessor)
  const accessorsBlock = templateAccessors.length ? '\n\n' + templateAccessors.join('\n\n') : ''

  let methodsBlock = ''
  if (page.inferredMethods?.length) {
    methodsBlock =
      '\n\n' + page.inferredMethods.map((m) => renderInferredMethod(m, options)).join('\n\n')
  } else {
    const contextState = newContextState()
    const stepLines = page.steps
      .filter((s) => s.action !== 'navigate')
      .map((s) =>
        wrapStepContext(
          s,
          renderStepInMethod(s, '        ', options),
          '        ',
          contextState,
          'page',
        ),
      )
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
  const contextHelpers = renderPageContextHelpers([
    ...page.steps,
    ...(page.inferredMethods ?? []).flatMap((m) => m.steps),
  ])

  const needsOsImport = /\bos\.environ\b/.test(`${methodsBlock}${accessorsBlock}`)
  const allSteps = [...page.steps, ...(page.inferredMethods ?? []).flatMap((m) => m.steps)]
  const needsReImport = allSteps.some((s) => s.assertionDetail?.type === 'matches')
  const stdlibImports = [
    needsReImport ? 'import re' : '',
    needsOsImport ? 'import os' : '',
    ...screenshotStdlibImports(allSteps),
  ].filter(Boolean)
  const screenshotHelper = renderScreenshotHelper(allSteps)
  const screenshotBlock = screenshotHelper ? `\n\n${screenshotHelper}\n` : ''
  const osImportLine = stdlibImports.length ? stdlibImports.join('\n') + '\n' : ''

  return `${osImportLine}from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
${pyInteractionImports(allSteps)}${screenshotThirdPartyImports(allSteps)}${screenshotBlock}

class ${page.className}:
${collisionComment}${constantsBlock}    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 10)

    def goto(self):
        self.driver.get(${pyStr(gotoUrl)})${contextHelpers}${accessorsBlock}${methodsBlock}
`
}
