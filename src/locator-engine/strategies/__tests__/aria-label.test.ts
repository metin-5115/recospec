import { describe, it, expect, beforeEach } from 'vitest'
import { AriaLabelStrategy } from '../aria-label'

const strategy = new AriaLabelStrategy()

describe('AriaLabelStrategy', () => {
  let doc: Document

  beforeEach(() => {
    doc = document
    document.body.innerHTML = ''
  })

  it('returns locator for aria-label attribute', () => {
    const el = document.createElement('button')
    el.setAttribute('aria-label', 'Close dialog')
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('aria-label')
    expect(result!.selector).toBe('[aria-label="Close dialog"]')
    expect(result!.framework.playwright).toBe('page.getByLabel("Close dialog")')
  })

  it('resolves aria-labelledby to text of referenced element', () => {
    const label = document.createElement('span')
    label.id = 'lbl-1'
    label.textContent = 'Search'
    document.body.appendChild(label)

    const el = document.createElement('input')
    el.setAttribute('aria-labelledby', 'lbl-1')
    document.body.appendChild(el)

    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('aria-labelledby')
    expect(result!.framework.playwright).toBe('page.getByLabel("Search")')
  })

  it('resolves aria-labelledby with multiple ids by joining text', () => {
    const a = document.createElement('span')
    a.id = 'lbl-a'
    a.textContent = 'First'
    const b = document.createElement('span')
    b.id = 'lbl-b'
    b.textContent = 'Last'
    document.body.append(a, b)

    const el = document.createElement('input')
    el.setAttribute('aria-labelledby', 'lbl-a lbl-b')
    document.body.appendChild(el)

    const result = strategy.evaluate(el, doc)

    expect(result!.framework.playwright).toBe('page.getByLabel("First Last")')
  })

  it('returns null when no aria-label or aria-labelledby', () => {
    const el = document.createElement('button')
    el.textContent = 'Submit'
    expect(strategy.evaluate(el, doc)).toBeNull()
  })

  it('falls back to aria-label when aria-labelledby references missing element', () => {
    const el = document.createElement('input')
    el.setAttribute('aria-labelledby', 'nonexistent-id')
    el.setAttribute('aria-label', 'Fallback label')
    document.body.appendChild(el)

    const result = strategy.evaluate(el, doc)

    expect(result!.strategy).toBe('aria-label')
    expect(result!.framework.playwright).toBe('page.getByLabel("Fallback label")')
  })
})
