import type { IRStep } from '../../ir/types'
import { renderLocator, memberExpr } from './locator'
import { renderAssertionMatcher } from './assertion'
import { renderMockBlock } from './mock'
import { getRenderMocks, renderFillValueExpr } from './state'

/** IR action → Playwright locator method for the element-targeted interactions. */
const INTERACTION_CALLS: Partial<Record<IRStep['action'], string>> = {
  select: 'selectOption',
  check: 'check',
  uncheck: 'uncheck',
  hover: 'hover',
  dblclick: 'dblclick',
}

export function renderStepInMethod(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}await this.page.goto(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}await ${memberExpr(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return `${indent}await this.${step.element.name}.fill(${expr});`
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
        step.assertionDetail.type === 'screenshot' || !step.element
          ? 'this.page'
          : memberExpr(step.element)
      return renderAssertionMatcher(step.assertionDetail, target, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  if (step.action === 'network' && step.network) {
    if (!getRenderMocks()) return ''
    // Page-object methods receive `this.page`; rewrite the helper accordingly.
    return renderMockBlock(step.network, indent).replace(/\bpage\.route\(/g, 'this.page.route(')
  }
  if (step.action === 'wait' && step.wait) {
    return renderWaitInMethod(step, indent)
  }
  return ''
}

function renderWaitInSpec(step: IRStep, indent: string): string {
  if (!step.wait) return ''
  const timeout = step.wait.timeoutMs
  if (step.wait.reason === 'networkidle') {
    return `${indent}await page.waitForLoadState('networkidle');`
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return `${indent}await page.waitForLoadState('networkidle');`
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
    return `${indent}await this.page.waitForLoadState('networkidle');`
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return `${indent}await this.page.waitForLoadState('networkidle');`
    // Page-object getters expose locators via `this.<name>`, so we don't need
    // to re-render the full chain — the named getter is canonical.
    return `${indent}await this.${step.element.name}.waitFor({ state: 'hidden', timeout: ${timeout} });`
  }
  if (step.wait.reason === 'element-visible' && step.element) {
    return `${indent}await this.${step.element.name}.waitFor({ state: 'visible', timeout: ${timeout} });`
  }
  return ''
}

export function renderStepInSpec(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}await page.goto(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}await ${renderLocator(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return `${indent}await ${renderLocator(step.element)}.fill(${expr});`
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
        step.assertionDetail.type === 'screenshot' || !step.element
          ? 'page'
          : renderLocator(step.element)
      return renderAssertionMatcher(step.assertionDetail, target, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  if (step.action === 'network' && step.network) {
    if (!getRenderMocks()) return ''
    return renderMockBlock(step.network, indent)
  }
  if (step.action === 'wait' && step.wait) {
    return renderWaitInSpec(step, indent)
  }
  return ''
}
