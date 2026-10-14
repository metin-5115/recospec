import { describe, it, expect } from 'vitest'
import { classifyText } from './text-classifier'

describe('classifyText — empty input', () => {
  it.each([null, undefined, '', '   '])('treats %j as a stable label', (value) => {
    expect(classifyText(value)).toBe('stable-label')
  })
})

describe('classifyText — signal priority', () => {
  it('a structural template wins over everything, including a button role', () => {
    expect(classifyText('Add to cart', { siblingTemplateCount: 3, role: 'button' })).toBe(
      'data-value',
    )
  })

  it('fewer than three template siblings is not a template', () => {
    expect(classifyText('Add to cart', { siblingTemplateCount: 2 })).toBe('stable-label')
  })

  it('a mutated text is volatile even when it would parse as a value', () => {
    expect(classifyText('12:30', { mutated: true })).toBe('volatile')
  })

  it('a template still beats mutation', () => {
    expect(classifyText('12:30', { siblingTemplateCount: 4, mutated: true })).toBe('data-value')
  })
})

describe('classifyText — value parsing', () => {
  it.each([
    ['42'],
    ['1,234.56'],
    ['1.234,56'],
    ['$19.99'],
    ['1 234 567'],
    ['45%'],
    ['%45'],
    ['09:41'],
    ['9:41 pm'],
    ['2026-08-12'],
    ['12.08.2026'],
    ['16 Eyl 2026 - 23 Eyl 2026'],
    ['2 saat önce'],
    ['yesterday'],
    ['heute'],
  ])('classifies %s as a data value', (text) => {
    expect(classifyText(text)).toBe('data-value')
  })

  it.each([['Sign in'], ['Add to cart'], ['Giriş yap'], ['Checkout']])(
    'classifies %s as a stable label',
    (text) => {
      expect(classifyText(text)).toBe('stable-label')
    },
  )

  it('collapses internal whitespace before parsing', () => {
    expect(classifyText('  42  ')).toBe('data-value')
    expect(classifyText('Add \n  to   cart')).toBe('stable-label')
  })
})

describe('classifyText — role context', () => {
  it('a button with a stable name stays stable', () => {
    expect(classifyText('Save', { role: 'button' })).toBe('stable-label')
  })

  it('a cell containing a digit leans data', () => {
    expect(classifyText('Room 4B', { role: 'cell' })).toBe('data-value')
  })

  it('a cell without a digit stays stable', () => {
    expect(classifyText('Total', { role: 'cell' })).toBe('stable-label')
  })

  it('a parsable value in a button role is still data (value parse outranks role)', () => {
    expect(classifyText('15', { role: 'button' })).toBe('data-value')
  })
})
