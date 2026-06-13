import type { IRElement } from '../../ir/types'

/**
 * Render the inner Cypress chainable expression for an element.
 * Returns e.g. `cy.get('[data-testid="email"]')` or `cy.findByRole('button', { name: 'Sign In' })`.
 */
/**
 * Composed (anchor + target) chain. Anchors always have a CSS form, so the
 * scope is a plain `cy.get`. Role + accessible-name targets approximate via
 * `.contains(tag, name)` — Cypress has no native accname query without the
 * testing-library plugin, which the scaffold does not assume.
 */
function renderComposed(el: IRElement): string {
  const spec = el.composed
  if (!spec) return `cy.get(${JSON.stringify(el.locatorValue)})`
  let scope = `cy.get(${JSON.stringify(spec.anchor.css)})`
  // Container anchors narrow a repeated row by its stable label / position.
  if (spec.anchor.kind === 'container') {
    if (spec.anchor.filterText)
      scope += `.filter(${JSON.stringify(`:contains(${JSON.stringify(spec.anchor.filterText)})`)})`
    if (typeof spec.anchor.nthIndex === 'number') scope += `.eq(${spec.anchor.nthIndex})`
  }
  const targetCss = spec.target.css ?? spec.target.tag
  let expr: string
  if (spec.target.name) {
    expr = `${scope}.contains(${JSON.stringify(targetCss)}, ${JSON.stringify(spec.target.name)})`
  } else if (spec.filterText) {
    expr = `${scope}.contains(${JSON.stringify(targetCss)}, ${JSON.stringify(spec.filterText)})`
  } else {
    expr = `${scope}.find(${JSON.stringify(targetCss)})`
  }
  if (typeof spec.nthIndex === 'number') expr += `.eq(${spec.nthIndex})`
  return expr
}

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
  if (strategy === 'layout' && el.layout) {
    // Cypress has no spatial-relation locator — emit an explanatory comment
    // and the best structural fallback rather than silently degrading.
    const spec = el.layout
    const anchorHint = spec.anchor.name ?? spec.anchor.css
    return `/* layout locator unsupported in Cypress: ${spec.target.tag} ${spec.relation} "${anchorHint}" — use Playwright/Selenium or add a data-testid */ cy.get(${JSON.stringify(spec.target.tag)})`
  }
  if (strategy === 'composed') {
    return renderComposed(el)
  }
  if (strategy === 'template' && el.template) {
    // Spec files have no method parameters — instantiate with the recorded value.
    const t = el.template
    const scope = t.scope ? `cy.get(${JSON.stringify(t.scope.css)})` : null
    const tag = el.tagName?.toLowerCase() || '*'
    if (t.strategy === 'aria-label') {
      const sel = JSON.stringify(`[aria-label="${t.capturedValue}"]`)
      return scope ? `${scope}.find(${sel})` : `cy.get(${sel})`
    }
    return scope
      ? `${scope}.contains(${JSON.stringify(tag)}, ${JSON.stringify(t.capturedValue)})`
      : `cy.contains(${JSON.stringify(tag)}, ${JSON.stringify(t.capturedValue)})`
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
  // Iframe — Cypress has no first-class nested-iframe traversal. Rather than
  // silently dropping the frame chain we emit an explanatory comment naming
  // each frame (outermost first) so the user can wire cypress-iframe manually.
  if (el.frameContext?.frameChain.length) {
    const inner = renderInnerLocator(el)
    const chain = el.frameContext.frameChain.join(' > ')
    return `/* iframe chain (cypress-iframe required): ${chain} */ ${inner}`
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
