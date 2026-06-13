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

  it('accepts text at exactly the 100-character boundary', () => {
    const el = document.createElement('p')
    el.textContent = 'a'.repeat(100)
    const result = strategy.evaluate(el, doc)
    expect(result).not.toBeNull()
  })

  it('rejects text one character past the boundary', () => {
    const el = document.createElement('p')
    el.textContent = 'b'.repeat(101)
    expect(strategy.evaluate(el, doc)).toBeNull()
  })

  it('rejects realistic long article paragraphs', () => {
    const el = document.createElement('p')
    el.textContent =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum vestibulum auctor.'
    expect(strategy.evaluate(el, doc)).toBeNull()
  })
})
