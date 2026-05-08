import type { IRPage, IRElement, IRStep, InferredMethod, AssertionDetail } from '../../ir/types'
import { renderLocator } from './locator'

// ---------------------------------------------------------------------------
// Element getters
// ---------------------------------------------------------------------------

function renderElementGetter(el: IRElement): string {
  const shadowWarning = el.shadowClosed
    ? `  // WARNING: element is inside a closed shadow root — locator may be unreliable\n`
    : ''
  const primary = `${shadowWarning}  ${el.name}() { return ${renderLocator(el)}; }`
  if (!el.fallbackLocators?.length) return primary
  const fallbacks = el.fallbackLocators
    .map((f) => `  // fallback: cy.get(${JSON.stringify(f)})`)
    .join('\n')
  return `${primary}\n${fallbacks}`
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
    case 'value':
      return `${indent}${chain}.should('have.value', ${JSON.stringify(d.expected ?? '')});`
    case 'attribute':
      return `${indent}${chain}.should('have.attr', ${JSON.stringify(d.attribute ?? '')}, ${JSON.stringify(d.expected ?? '')});`
    case 'count':
      return `${indent}${chain}.should('have.length', ${Number(d.expected ?? 0)});`
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
    return `${indent}this.${step.element.name}().clear().type(${JSON.stringify(step.value ?? '')});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}cy.focused().type(${JSON.stringify(`{${step.key.toLowerCase()}}`)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail && step.element) {
      return renderAssertion(step.assertionDetail, `this.${step.element.name}()`, indent)
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
