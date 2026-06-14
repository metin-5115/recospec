import type { IRScenario, IRStep, AssertionDetail, IRElement, TestDataConfig } from '../../ir/types'
import { renderLocator } from './locator'
import { resolveTestData } from '../../planner/test-data-resolver'

let TEST_DATA: TestDataConfig | undefined
export function setCypressTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

function renderFillValueExpr(el: IRElement | undefined, recordedValue: string): string {
  const r = resolveTestData(el, recordedValue, TEST_DATA)
  if (!r.useEnvVar) return JSON.stringify(r.literal)
  // Cypress.env returns undefined when missing; `||` falls back to the safe default.
  return `Cypress.env(${JSON.stringify(r.paramName)}) || ${JSON.stringify(r.defaultValue)}`
}

export { renderFillValueExpr as _internal_renderFillValueExpr }

function renderAssertion(d: AssertionDetail, chain: string, indent: string): string {
  switch (d.type) {
    case 'visible':
      return `${indent}${chain}.should('be.visible');`
    case 'hidden':
      return `${indent}${chain}.should('not.be.visible');`
    case 'text':
      return `${indent}${chain}.should('have.text', ${JSON.stringify(d.expected ?? '')});`
    case 'text-contains':
      return `${indent}${chain}.should('contain.text', ${JSON.stringify(d.expected ?? '')});`
    case 'not-empty':
      return `${indent}${chain}.invoke('text').should('not.be.empty');`
    case 'matches':
      return `${indent}${chain}.invoke('text').should('match', new RegExp(${JSON.stringify(String(d.expected ?? ''))}));`
    case 'value':
      return `${indent}${chain}.should('have.value', ${JSON.stringify(d.expected ?? '')});`
    case 'attribute':
      return `${indent}${chain}.should('have.attr', ${JSON.stringify(d.attribute ?? '')}, ${JSON.stringify(d.expected ?? '')});`
    case 'count':
      return `${indent}${chain}.should('have.length', ${Number(d.expected ?? 0)});`
    case 'screenshot': {
      const name = d.name ?? 'snapshot'
      const pct = Math.round((d.threshold ?? 0.02) * 100) / 100
      return `${indent}${chain}.matchImageSnapshot(${JSON.stringify(name)}, { failureThreshold: ${pct}, failureThresholdType: 'percent' });`
    }
  }
}

function renderWait(step: IRStep, indent: string): string {
  if (!step.wait) return ''
  const timeout = step.wait.timeoutMs
  if (step.wait.reason === 'networkidle') {
    return [
      `${indent}cy.intercept('**/*').as('netReq');`,
      `${indent}cy.wait('@netReq', { timeout: ${timeout} });`,
    ].join('\n')
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return ''
    return `${indent}${renderLocator(step.element)}.should('not.exist');`
  }
  if (step.wait.reason === 'element-visible' && step.element) {
    return `${indent}${renderLocator(step.element)}.should('be.visible');`
  }
  return ''
}

function renderStepInSpec(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}cy.visit(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}${renderLocator(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return `${indent}${renderLocator(step.element)}.clear().type(${expr});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}cy.focused().type(${JSON.stringify(`{${step.key.toLowerCase()}}`)});`
  }
  if (step.action === 'wait') {
    return renderWait(step, indent)
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      const chain =
        step.assertionDetail.type === 'screenshot' || !step.element
          ? 'cy'
          : renderLocator(step.element)
      return renderAssertion(step.assertionDetail, chain, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  return ''
}

export function renderScenario(scenario: IRScenario): string {
  const imports = scenario.pages
    .map((p) => `import { ${p.className} } from '../pages/${p.className}';`)
    .join('\n')

  const testBody = scenario.pages
    .flatMap((page) => page.steps.map((step) => renderStepInSpec(step, '    ')).filter(Boolean))
    .join('\n')

  return `${imports}

describe('${scenario.name}', () => {
  it('full flow', () => {
${testBody}
  });
});
`
}
