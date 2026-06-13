import { describe, it, expect, beforeEach } from 'vitest'
import { TestIdStrategy } from './testid'

const strategy = new TestIdStrategy()

function makeElement(attrs: Record<string, string>): Element {
  const el = document.createElement('button')
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v)
  }
  return el
}

describe('TestIdStrategy', () => {
  let doc: Document

  beforeEach(() => {
    doc = document
  })

  it('returns locator for data-testid', () => {
    const el = makeElement({ 'data-testid': 'submit-btn' })
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('testid')
    expect(result!.selector).toBe('submit-btn')
  })

  it('returns locator for data-test-id when data-testid absent', () => {
    const el = makeElement({ 'data-test-id': 'email-input' })
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.selector).toBe('email-input')
    expect(result!.framework.cypress).toContain('data-test-id')
  })

  it('returns null when neither attribute is present', () => {
    const el = makeElement({ id: 'btn', class: 'primary' })
    expect(strategy.evaluate(el, doc)).toBeNull()
  })

  it('returns null for empty data-testid', () => {
    const el = makeElement({ 'data-testid': '' })
    expect(strategy.evaluate(el, doc)).toBeNull()
  })

  it('produces correct framework outputs for data-testid', () => {
    const el = makeElement({ 'data-testid': 'login-btn' })
    const result = strategy.evaluate(el, doc)

    expect(result!.framework.playwright).toBe("page.getByTestId('login-btn')")
    expect(result!.framework.cypress).toBe('cy.get(\'[data-testid="login-btn"]\')')
    expect(result!.framework.seleniumPy).toContain('By.CSS_SELECTOR')
    expect(result!.framework.seleniumPy).toContain('login-btn')
  })

  it('data-testid takes priority over data-test-id when both present', () => {
    const el = makeElement({ 'data-testid': 'primary', 'data-test-id': 'secondary' })
    const result = strategy.evaluate(el, doc)

    expect(result!.selector).toBe('primary')
    expect(result!.framework.cypress).toContain('data-testid')
  })

  it('returns locator for data-cy', () => {
    const el = makeElement({ 'data-cy': 'checkout-btn' })
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('testid')
    expect(result!.selector).toBe('checkout-btn')
    expect(result!.framework.cypress).toBe('cy.get(\'[data-cy="checkout-btn"]\')')
  })

  it('uses page.locator (not getByTestId) for data-cy in Playwright', () => {
    const el = makeElement({ 'data-cy': 'submit' })
    const result = strategy.evaluate(el, doc)

    expect(result!.framework.playwright).toBe(`page.locator('[data-cy="submit"]')`)
    expect(result!.framework.playwright).not.toContain('getByTestId')
  })

  it('uses page.locator (not getByTestId) for data-test-id in Playwright', () => {
    const el = makeElement({ 'data-test-id': 'username' })
    const result = strategy.evaluate(el, doc)

    expect(result!.framework.playwright).toBe(`page.locator('[data-test-id="username"]')`)
    expect(result!.framework.playwright).not.toContain('getByTestId')
  })

  it('data-testid takes priority over data-cy when both present', () => {
    const el = makeElement({ 'data-testid': 'official', 'data-cy': 'legacy' })
    const result = strategy.evaluate(el, doc)

    expect(result!.selector).toBe('official')
    expect(result!.framework.cypress).toContain('data-testid')
  })

  it('data-test-id takes priority over data-cy when both present', () => {
    const el = makeElement({ 'data-test-id': 'official', 'data-cy': 'legacy' })
    const result = strategy.evaluate(el, doc)

    expect(result!.selector).toBe('official')
    expect(result!.framework.cypress).toContain('data-test-id')
  })
})
