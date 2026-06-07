import type {
  IRPage,
  IRElement,
  IRStep,
  IRFallback,
  InferredMethod,
  AssertionDetail,
  TestDataConfig,
} from '../../ir/types'
import { renderLocator } from './locator'
import { resolveTestData } from '../../planner/test-data-resolver'

let TEST_DATA: TestDataConfig | undefined
export function setCypressPageObjectTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

function renderFillValueExpr(el: IRElement | undefined, recordedValue: string): string {
  const r = resolveTestData(el, recordedValue, TEST_DATA)
  if (!r.useEnvVar) return JSON.stringify(r.literal)
  return `Cypress.env(${JSON.stringify(r.paramName)}) || ${JSON.stringify(r.defaultValue)}`
}

// ---------------------------------------------------------------------------
// Element getters
// ---------------------------------------------------------------------------

function renderFallbackExpr(f: IRFallback): string {
  const val = f.locatorValue
  switch (f.strategy) {
    case 'testid': {
      const name = val.replace(/^\[data-testid="(.+)"\]$/, '$1')
      return `cy.get('[data-testid="${name}"]')`
    }
    case 'aria-label': {
      const label = val.replace(/^\[aria-label="(.+)"\]$/, '$1')
      return `cy.findByLabelText(${JSON.stringify(label)})`
    }
    case 'role-name':
      return `cy.findByRole(${val})`
    case 'text':
      return `cy.contains(${JSON.stringify(val)})`
    default:
      return `cy.get(${JSON.stringify(val)})`
  }
}

function renderElementGetter(el: IRElement): string {
  const shadowWarning = el.shadowClosed
    ? `  // WARNING: element is inside a closed shadow root — locator may be unreliable\n`
    : ''
  const primary = `${shadowWarning}  ${el.name}() { return ${renderLocator(el)}; }`
  if (!el.fallbackLocators?.length) return primary
  const exprs = el.fallbackLocators.map(renderFallbackExpr).join(', ')
  const fallbackComment = `  // Fallbacks: ${exprs}`
  return `${primary}\n${fallbackComment}`
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Step rendering inside Page Object methods
// ---------------------------------------------------------------------------

function renderStepInMethod(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}cy.visit(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}this.${step.element.name}().click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return `${indent}this.${step.element.name}().clear().type(${expr});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}cy.focused().type(${JSON.stringify(`{${step.key.toLowerCase()}}`)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      const chain =
        step.assertionDetail.type === 'screenshot' || !step.element
          ? 'cy'
          : `this.${step.element.name}()`
      return renderAssertion(step.assertionDetail, chain, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  return ''
}

// ---------------------------------------------------------------------------
// Inferred methods (e.g. login(email, password))
// ---------------------------------------------------------------------------

function renderInferredMethod(method: InferredMethod): string {
  const paramList = method.params.join(', ')
  const bodyLines = method.steps
    .map((s) => {
      if (s.action === 'fill' && s.element) {
        const baseName = s.element.name.replace(/Input$|Button$|Link$|Select$/, '')
        const param = baseName.charAt(0).toLowerCase() + baseName.slice(1)
        const paramIdx = method.params.indexOf(param)
        if (paramIdx !== -1) {
          return `    this.${s.element.name}().clear().type(${method.params[paramIdx]});`
        }
      }
      return renderStepInMethod(s, '    ')
    })
    .filter(Boolean)
    .join('\n')

  return `  ${method.name}(${paramList}) {\n${bodyLines}\n  }`
}

// ---------------------------------------------------------------------------
// Page Object class
// ---------------------------------------------------------------------------

export function renderPageObject(page: IRPage): string {
  const elementGetters = page.elements.map(renderElementGetter).join('\n\n')

  const gotoStep = page.steps.find((s) => s.action === 'navigate')
  const gotoUrl = gotoStep?.url ?? '/'

  let methodsBlock = ''
  if (page.inferredMethods?.length) {
    methodsBlock = '\n' + page.inferredMethods.map(renderInferredMethod).join('\n\n')
  } else {
    const stepLines = page.steps
      .filter((s) => s.action !== 'navigate')
      .map((s) => renderStepInMethod(s, '    '))
      .filter(Boolean)
      .join('\n')
    if (stepLines) {
      methodsBlock = `\n  performSteps() {\n${stepLines}\n  }`
    }
  }

  const collisionComment = page.collisionWarning
    ? `  // WARNING: Multiple pages share this URL pattern (${page.normalizedUrl}) with different titles.\n`
    : ''

  return `export class ${page.className} {
${elementGetters}

${collisionComment}  visit() {
    cy.visit(${JSON.stringify(gotoUrl)});
    return this;
  }
${methodsBlock}
}
`
}
