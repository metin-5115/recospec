import type { IRStep } from '../../ir/types'
import { renderLocator, memberExpr } from './locator'
import { renderAssertionMatcher } from './assertion'
import { renderMockBlock } from './mock'
import { renderFillValueExpr } from './fill-value'
import type { RenderOptions } from '../registry'
import { isPageLevelAssertion } from '../../shared/page-assertion'
import { isMultiUpload, uploadFixturePaths } from '../../shared/upload-fixtures'

/** IR action → Playwright locator method for the element-targeted interactions. */
const INTERACTION_CALLS: Partial<Record<IRStep['action'], string>> = {
  select: 'selectOption',
  check: 'check',
  uncheck: 'uncheck',
  hover: 'hover',
  dblclick: 'dblclick',
}

/**
 * Moves the mock registrations to the front of a rendered step list: a `page.route` registered
 * after the click that fires the request would miss it. `lines` is index-aligned with `steps`.
 */
export function mocksFirst(steps: readonly IRStep[], lines: readonly string[]): string[] {
  const isMock = (i: number) => steps[i]?.action === 'network'
  return [...lines.filter((_, i) => isMock(i)), ...lines.filter((_, i) => !isMock(i))]
}

/** `setInputFiles(...)` argument: a single path, or an array for a `multiple` input. */
function uploadArg(step: IRStep): string {
  const paths = uploadFixturePaths(step).map((p) => JSON.stringify(p))
  return isMultiUpload(step) ? `[${paths.join(', ')}]` : (paths[0] ?? '[]')
}

export function renderStepInMethod(
  step: IRStep,
  indent: string,
  options: RenderOptions = {},
): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}await this.page.goto(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}await ${memberExpr(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '', options.testData)
    return `${indent}await this.${step.element.name}.fill(${expr});`
  }
  if (step.action === 'upload' && step.element && step.upload) {
    return `${indent}await ${memberExpr(step.element)}.setInputFiles(${uploadArg(step)});`
  }
  if (step.element && INTERACTION_CALLS[step.action]) {
    const args = step.action === 'select' ? JSON.stringify(step.value ?? '') : ''
    return `${indent}await ${memberExpr(step.element)}.${INTERACTION_CALLS[step.action]}(${args});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}await this.page.keyboard.press(${JSON.stringify(step.key)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      const target =
        isPageLevelAssertion(step.assertionDetail) || !step.element
          ? 'this.page'
          : memberExpr(step.element)
      return renderAssertionMatcher(step.assertionDetail, target, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  if (step.action === 'network' && step.network) {
    if (!options.includeMocks) return ''
    // Page-object methods receive `this.page`; rewrite the helper accordingly.
    return renderMockBlock(step.network, indent).replace(/\bpage\.route\(/g, 'this.page.route(')
  }
  if (step.action === 'wait' && step.wait) {
    return renderWaitInMethod(step, indent)
  }
  return ''
}

/**
 * Playwright auto-waits for actionability before every action and retries web-first assertions,
 * and its docs discourage `networkidle`, so a blanket idle wait is not generated. When the
 * recording shows which route the action ended on, waiting for that URL is a real condition.
 */
function renderRouteWait(step: IRStep, pageRef: string, indent: string): string {
  const route = step.pageUrl
  if (!route || route === '/' || route.includes(':')) return ''
  const escaped = route.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return `${indent}await ${pageRef}.waitForURL(/${escaped}(?:[?#]|$)/);`
}

function renderWaitInSpec(step: IRStep, indent: string): string {
  if (!step.wait) return ''
  const timeout = step.wait.timeoutMs
  if (step.wait.reason === 'networkidle') {
    return renderRouteWait(step, 'page', indent)
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return renderRouteWait(step, 'page', indent)
    return `${indent}await ${renderLocator(step.element)}.waitFor({ state: 'hidden', timeout: ${timeout} });`
  }
  if (step.wait.reason === 'element-visible' && step.element) {
    return `${indent}await ${renderLocator(step.element)}.waitFor({ state: 'visible', timeout: ${timeout} });`
  }
  return ''
}

function renderWaitInMethod(step: IRStep, indent: string): string {
  if (!step.wait) return ''
  const timeout = step.wait.timeoutMs
  if (step.wait.reason === 'networkidle') {
    return renderRouteWait(step, 'this.page', indent)
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return renderRouteWait(step, 'this.page', indent)
    // Page-object getters expose locators via `this.<name>`, so we don't need
    // to re-render the full chain — the named getter is canonical.
    return `${indent}await this.${step.element.name}.waitFor({ state: 'hidden', timeout: ${timeout} });`
  }
  if (step.wait.reason === 'element-visible' && step.element) {
    return `${indent}await this.${step.element.name}.waitFor({ state: 'visible', timeout: ${timeout} });`
  }
  return ''
}

export function renderStepInSpec(
  step: IRStep,
  indent: string,
  options: RenderOptions = {},
): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}await page.goto(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}await ${renderLocator(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '', options.testData)
    return `${indent}await ${renderLocator(step.element)}.fill(${expr});`
  }
  if (step.action === 'upload' && step.element && step.upload) {
    return `${indent}await ${renderLocator(step.element)}.setInputFiles(${uploadArg(step)});`
  }
  if (step.element && INTERACTION_CALLS[step.action]) {
    const args = step.action === 'select' ? JSON.stringify(step.value ?? '') : ''
    return `${indent}await ${renderLocator(step.element)}.${INTERACTION_CALLS[step.action]}(${args});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}await page.keyboard.press(${JSON.stringify(step.key)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      const target =
        isPageLevelAssertion(step.assertionDetail) || !step.element
          ? 'page'
          : renderLocator(step.element)
      return renderAssertionMatcher(step.assertionDetail, target, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  if (step.action === 'network' && step.network) {
    if (!options.includeMocks) return ''
    return renderMockBlock(step.network, indent)
  }
  if (step.action === 'wait' && step.wait) {
    return renderWaitInSpec(step, indent)
  }
  return ''
}
