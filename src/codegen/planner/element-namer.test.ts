import { describe, it, expect } from 'vitest'
import { nameElement } from './element-namer'
import type { ElementSnapshot } from '@shared/types/action'
import type { Locator } from '@shared/types/locator'

function snapshot(tagName: string, overrides: Partial<ElementSnapshot> = {}): ElementSnapshot {
  return { tagName, attributes: {}, textContent: '', ...overrides }
}

function locator(strategy: Locator['strategy'], selector: string): Locator {
  return { strategy, selector, framework: {} } as Locator
}

describe('nameElement — testid strategy', () => {
  it('camel-cases a raw testid value', () => {
    expect(nameElement(snapshot('button'), locator('testid', 'sign-in'), new Set())).toBe('signIn')
  })

  it('unwraps an attribute-selector form instead of leaking the attribute name', () => {
    const name = nameElement(
      snapshot('button'),
      locator('testid', '[data-testid="sign-in"]'),
      new Set(),
    )
    expect(name).toBe('signIn')
  })

  it('unwraps single-quoted data-cy selectors', () => {
    const name = nameElement(
      snapshot('input'),
      locator('testid', "[data-cy='email_field']"),
      new Set(),
    )
    expect(name).toBe('emailField')
  })

  it('keeps names stable for values that merely contain brackets', () => {
    const name = nameElement(snapshot('div'), locator('testid', 'row[1]'), new Set())
    expect(name).toBe('row1')
  })
})

describe('nameElement — other strategies', () => {
  it('uses aria-label plus tag suffix', () => {
    const name = nameElement(
      snapshot('input', { attributes: { 'aria-label': 'Email' } }),
      locator('aria-label', '[aria-label="Email"]'),
      new Set(),
    )
    expect(name).toBe('emailInput')
  })

  it('falls back to text content with suffix', () => {
    const name = nameElement(
      snapshot('button', { textContent: 'Sign In' }),
      locator('text', 'Sign In'),
      new Set(),
    )
    expect(name).toBe('signInButton')
  })

  it('uniquifies repeated names', () => {
    const used = new Set(['signIn'])
    expect(nameElement(snapshot('button'), locator('testid', 'sign-in'), used)).toBe('signIn2')
  })

  it('names template locators without freezing the recorded sample', () => {
    const tpl = {
      strategy: 'template',
      selector: 'x',
      framework: {},
      template: { kind: 'date' },
    } as unknown as Locator
    expect(nameElement(snapshot('td', { textContent: '12' }), tpl, new Set())).toBe('dateCell')
  })
})
