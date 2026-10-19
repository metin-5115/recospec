import { describe, it, expect } from 'vitest'
import { flowSlug, flowSnakeSlug, flowPascalName, FLOW_SLUG_FALLBACK } from './flow-slug'

describe('flow slug helpers', () => {
  it('kebab-cases a flow name', () => {
    expect(flowSlug('Login With Valid User')).toBe('login-with-valid-user')
  })

  it('falls back when nothing ASCII survives', () => {
    expect(flowSlug('???')).toBe(FLOW_SLUG_FALLBACK)
    expect(flowSlug('')).toBe(FLOW_SLUG_FALLBACK)
  })

  it('derives snake_case and PascalCase from the same slug', () => {
    expect(flowSnakeSlug('Checkout: guest user')).toBe('checkout_guest_user')
    expect(flowPascalName('Checkout: guest user')).toBe('CheckoutGuestUser')
  })

  it('never yields a Pascal name that starts with a digit', () => {
    expect(flowPascalName('2FA flow')).toBe('Flow2faFlow')
  })

  it('gives two different flows two different slugs', () => {
    expect(flowSlug('Login')).not.toBe(flowSlug('Checkout'))
  })
})
