import type { IRElement } from '../../ir/types'

/**
 * Render the inner Cypress chainable expression for an element.
 * Returns e.g. `cy.get('[data-testid="email"]')` or `cy.findByRole('button', { name: 'Sign In' })`.
 */
function renderInnerLocator(el: IRElement): string {
  const val = el.locatorValue
  const strategy = el.locatorStrategy

  if (strategy === 'testid') {
    const name = val.replace(/^\[data-testid="(.+)"\]$/, '$1')
    return `cy.get(${JSON.stringify(`[data-testid="${name}"]`)})`
  }
  if (strategy === 'aria-label') {
    const label = val.replace(/^\[aria-label="(.+)"\]$/, '$1')
    return `cy.findByLabelText(${JSON.stringify(label)})`
  }
  if (strategy === 'role-name') {
    // val looks like: 'button', { name: 'Sign In' }
    return `cy.findByRole(${val})`
  }
  if (strategy === 'text') {
    return `cy.contains(${JSON.stringify(val)})`
  }
  return `cy.get(${JSON.stringify(val)})`
}

/**
 * Render full Cypress locator including iframe / shadow DOM context where applicable.
 *
 * Cypress has limited native iframe / shadow DOM support; we annotate with comments
 * and emit `.shadow()` / `.iframe()` chains where possible.
 */
export function renderLocator(el: IRElement): string {
  // Iframe — Cypress requires the cypress-iframe plugin or .its('0.contentDocument.body')
  // For v1 we emit a TODO comment; users can switch to the iframe plugin manually.
  if (el.frameContext?.frameChain.length) {
    const inner = renderInnerLocator(el)
    return `/* iframe(${el.frameContext.frameChain.map((f) => JSON.stringify(f)).join(', ')}) */ ${inner}`
  }

  // Shadow DOM — Cypress supports .shadow() to pierce open shadow roots
  if (el.shadowContext?.hostChain.length) {
    const hosts = el.shadowContext.hostChain
    // Outer-most host first, then chain shadow + nested host queries.
    const [first, ...rest] = hosts
    let chain = `cy.get(${JSON.stringify(first)}).shadow()`
    for (const host of rest) {
      chain += `.find(${JSON.stringify(host)}).shadow()`
    }
    return `${chain}.find(${JSON.stringify(el.locatorValue)})`
  }

  return renderInnerLocator(el)
}
