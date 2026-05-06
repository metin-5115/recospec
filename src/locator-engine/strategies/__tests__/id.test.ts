import { describe, it, expect } from 'vitest'
import { IdStrategy } from '../id'

const strategy = new IdStrategy()
const doc = document

describe('IdStrategy', () => {
  it('returns locator for a static semantic id', () => {
    const el = document.createElement('input')
    el.id = 'email-input'
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('id')
    expect(result!.selector).toBe('#email-input')
    expect(result!.framework.seleniumPy).toContain('By.ID')
  })

  it('rejects UUID-style id', () => {
    const el = document.createElement('div')
    el.id = '550e8400-e29b-41d4-a716-446655440000'
    expect(strategy.evaluate(el, doc)).toBeNull()
  })

  it('rejects CSS-in-JS hash id (css- prefix)', () => {
    const el = document.createElement('div')
    el.id = 'css-1a2b3c'
    expect(strategy.evaluate(el, doc)).toBeNull()
  })

  it('rejects MUI-pattern id with numeric suffix (ember pattern)', () => {
    const el = document.createElement('div')
    el.id = 'ember123'
    expect(strategy.evaluate(el, doc)).toBeNull()
  })

  it('rejects id with heavy numeric suffix', () => {
    const el = document.createElement('div')
    el.id = 'component-12345'
    expect(strategy.evaluate(el, doc)).toBeNull()
  })

  it('rejects high-entropy long id', () => {
    const el = document.createElement('div')
    el.id = 'xQ9mZ2kPvRtYwNsA'
    expect(strategy.evaluate(el, doc)).toBeNull()
  })
})
