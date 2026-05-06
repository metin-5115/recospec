import { describe, it, expect } from 'vitest'
import { TextStrategy } from '../text'

const strategy = new TextStrategy()
const doc = document

describe('TextStrategy', () => {
  it('returns locator for visible text content', () => {
    const el = document.createElement('button')
    el.textContent = 'Sign In'
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('text')
    expect(result!.selector).toBe('Sign In')
    expect(result!.framework.playwright).toBe('page.getByText("Sign In", { exact: true })')
  })

  it('returns null for text longer than 100 characters', () => {
    const el = document.createElement('p')
    el.textContent = 'a'.repeat(101)
    expect(strategy.evaluate(el, doc)).toBeNull()
  })

  it('normalizes whitespace (collapse and trim)', () => {
    const el = document.createElement('button')
    el.textContent = '  Save  \n  changes  '
    const result = strategy.evaluate(el, doc)

    expect(result!.selector).toBe('Save changes')
  })

  it('returns null for empty text content', () => {
    const el = document.createElement('div')
    el.textContent = '   '
    expect(strategy.evaluate(el, doc)).toBeNull()
  })
})
