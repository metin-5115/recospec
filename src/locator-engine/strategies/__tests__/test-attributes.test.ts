import { describe, it, expect } from 'vitest'
import { TestAttributesStrategy } from '../test-attributes'

const strategy = new TestAttributesStrategy()
const doc = document

describe('TestAttributesStrategy', () => {
  it('returns locator for data-test attribute', () => {
    const el = document.createElement('button')
    el.setAttribute('data-test', 'submit-btn')
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('test-attr')
    expect(result!.selector).toBe('[data-test="submit-btn"]')
  })

  it('returns locator for data-cy attribute', () => {
    const el = document.createElement('input')
    el.setAttribute('data-cy', 'email-field')
    const result = strategy.evaluate(el, doc)

    expect(result!.selector).toBe('[data-cy="email-field"]')
    expect(result!.framework.cypress).toContain('data-cy')
    expect(result!.framework.cypress).toContain('email-field')
  })

  it('returns locator for data-qa attribute', () => {
    const el = document.createElement('div')
    el.setAttribute('data-qa', 'modal-container')
    const result = strategy.evaluate(el, doc)

    expect(result!.strategy).toBe('test-attr')
    expect(result!.selector).toBe('[data-qa="modal-container"]')
  })

  it('returns locator for data-automation attribute', () => {
    const el = document.createElement('a')
    el.setAttribute('data-automation', 'nav-link')
    const result = strategy.evaluate(el, doc)

    expect(result!.framework.playwright).toContain('data-automation')
    expect(result!.framework.playwright).toContain('nav-link')
    expect(result!.framework.seleniumPy).toContain('By.CSS_SELECTOR')
  })

  it('returns null when no test attribute is present', () => {
    const el = document.createElement('button')
    el.setAttribute('id', 'btn')
    el.setAttribute('class', 'btn-primary')
    expect(strategy.evaluate(el, doc)).toBeNull()
  })
})
