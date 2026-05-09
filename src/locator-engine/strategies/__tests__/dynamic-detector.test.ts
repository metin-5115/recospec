import { describe, it, expect } from 'vitest'
import { isDynamicClass, isDynamicId } from '../../scoring/dynamic-detector'

describe('isDynamicClass', () => {
  it('detects emotion css- prefix', () => {
    expect(isDynamicClass('css-1a2b3c')).toBe(true)
  })

  it('detects JSS jss prefix', () => {
    expect(isDynamicClass('jss42')).toBe(true)
  })

  it('detects styled-components sc- prefix', () => {
    expect(isDynamicClass('sc-abcdef1234')).toBe(true)
  })

  it('detects MUI Mui prefix', () => {
    expect(isDynamicClass('MuiButton-root')).toBe(true)
  })

  it('accepts static semantic class name', () => {
    expect(isDynamicClass('btn-primary')).toBe(false)
  })

  it('accepts short class name without dynamic pattern', () => {
    expect(isDynamicClass('active')).toBe(false)
  })
})

describe('isDynamicId', () => {
  it('detects UUID format', () => {
    expect(isDynamicId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('detects ember id pattern', () => {
    expect(isDynamicId('ember42')).toBe(true)
  })

  it('detects React portal id pattern (:r0:)', () => {
    expect(isDynamicId(':r0:')).toBe(true)
  })

  it('detects id with heavy numeric suffix', () => {
    expect(isDynamicId('widget-12345')).toBe(true)
  })

  it('accepts stable semantic id', () => {
    expect(isDynamicId('login-form')).toBe(false)
  })

  it('accepts short numeric suffix (1-2 digits)', () => {
    expect(isDynamicId('section-2')).toBe(false)
  })

  it('accepts simple word id', () => {
    expect(isDynamicId('email')).toBe(false)
  })

  it('detects high-entropy long id', () => {
    expect(isDynamicId('xQ9mZ2kPvRtYwNsA')).toBe(true)
  })

  // Boundary: digit-suffix threshold raised to 5+. Previously (3+) misclassified
  // semantic domain ids like BVD-135, order-1234, ticket-789 as dynamic.
  it('accepts 3-digit semantic id (BVD-135)', () => {
    expect(isDynamicId('BVD-135')).toBe(false)
  })

  it('accepts 3-digit ticket id', () => {
    expect(isDynamicId('ticket-789')).toBe(false)
  })

  it('accepts 4-digit order id', () => {
    expect(isDynamicId('order-1234')).toBe(false)
  })

  it('detects 5-digit suffix (boundary, dynamic)', () => {
    expect(isDynamicId('widget-12345')).toBe(true)
  })

  it('detects 6-digit suffix (dynamic)', () => {
    expect(isDynamicId('product-123456')).toBe(true)
  })

  it('detects compound numeric suffix when first group is 5+ digits', () => {
    expect(isDynamicId('row-12345-1')).toBe(true)
  })

  it('accepts compound numeric suffix when first group is short', () => {
    expect(isDynamicId('row-12-1')).toBe(false)
  })
})
