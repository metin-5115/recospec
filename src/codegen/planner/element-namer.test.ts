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

describe('nameElement — accessible names (labelled form controls)', () => {
  const roleName = (role: string, name: string): Locator =>
    locator('role-name', `${role}[name="${name}"]`)
  const composedIn = (card: string, target: string): Locator =>
    ({
      strategy: 'composed',
      selector: `article hasText="${card}" >> ${target}`,
      framework: {},
      composed: {
        anchor: { kind: 'container', value: 'article', css: 'article', filterText: card },
        target: { tag: target },
      },
    }) as unknown as Locator

  it('names a labelled textbox from its accessible name instead of inputInput', () => {
    const el = snapshot('input', { attributes: { type: 'text' } })
    expect(nameElement(el, roleName('textbox', 'Full name'), new Set())).toBe('fullNameInput')
  })

  it('suffixes radios and checkboxes by role', () => {
    const radio = snapshot('input', { attributes: { type: 'radio' } })
    const box = snapshot('input', { attributes: { type: 'checkbox' } })
    expect(nameElement(radio, roleName('radio', 'Express (+$12)'), new Set())).toBe('expressRadio')
    expect(nameElement(box, roleName('checkbox', 'Gift wrap'), new Set())).toBe('giftWrapCheckbox')
  })

  it('drops the dynamic counter from names such as "Cart (3)"', () => {
    const link = snapshot('a', { textContent: 'Cart (3)' })
    const name = nameElement(link, locator('id', '#cart-link'), new Set(), [
      roleName('link', 'Cart (3)'),
    ])
    expect(name).toBe('cartLink')
  })

  it('never names a select from the text of its options', () => {
    const select = snapshot('select', { textContent: 'SML' })
    expect(nameElement(select, locator('css', 'label > select'), new Set())).not.toMatch(/sml/i)
  })

  it('uses a candidate accessible name and the card it sits in for composed locators', () => {
    const select = snapshot('select', { textContent: 'SML' })
    const hints = [roleName('combobox', 'Size'), locator('label', 'Size')]
    expect(nameElement(select, composedIn('Trail Runner', 'select'), new Set(), hints)).toBe(
      'trailRunnerSizeSelect',
    )
    const add = snapshot('button', { textContent: 'Add to cart' })
    expect(
      nameElement(add, composedIn('Canvas Tote', 'button'), new Set(), [
        roleName('button', 'Add to cart'),
      ]),
    ).toBe('canvasToteAddToCartButton')
  })

  it('falls back to a label candidate when there is no role-name candidate', () => {
    const el = snapshot('input', { attributes: { type: 'text' } })
    expect(
      nameElement(el, locator('css', 'input'), new Set(), [locator('label', 'Postal code')]),
    ).toBe('postalCodeInput')
  })

  it('keeps testid and aria-label ahead of the accessible name', () => {
    const el = snapshot('button', { attributes: { 'aria-label': 'Close' } })
    expect(
      nameElement(el, locator('testid', 'dismiss'), new Set(), [roleName('button', 'Close')]),
    ).toBe('dismiss')
    expect(
      nameElement(el, locator('aria-label', '[aria-label="Close"]'), new Set(), [
        roleName('button', 'X'),
      ]),
    ).toBe('closeButton')
  })

  it('does not repeat the suffix when the name already ends with it', () => {
    const el = snapshot('button')
    expect(nameElement(el, roleName('button', 'Submit button'), new Set())).toBe('submitButton')
  })
})

describe('nameElement — acronyms in labels', () => {
  const roleName = (role: string, name: string): Locator =>
    locator('role-name', `${role}[name="${name}"]`)
  const input = snapshot('input', { attributes: { type: 'text' } })

  it.each([
    ['CVV', 'cvvInput'],
    ['Card CVV', 'cardCvvInput'],
    ['ZIP code', 'zipCodeInput'],
    ['ID', 'idInput'],
    ['Name on card', 'nameOnCardInput'],
  ])('names %s as %s', (label, expected) => {
    expect(nameElement(input, roleName('textbox', label), new Set())).toBe(expected)
  })
})

describe('nameElement — non-ASCII text', () => {
  it('transliterates Turkish letters instead of dropping them', () => {
    const name = nameElement(
      snapshot('button', { attributes: { 'aria-label': 'Uçuş ara' } }),
      locator('aria-label', '[aria-label="Uçuş ara"]'),
      new Set(),
    )
    expect(name).toBe('ucusAraButton')
  })

  it('keeps every word of a long Turkish accessible name', () => {
    const name = nameElement(
      snapshot('li'),
      locator('role-name', 'option[name="Ercan Uluslararası Havalimanı"]'),
      new Set(),
    )
    expect(name).toBe('ercanUluslararasiHavalimani')
  })

  it('handles the dotted capital İ and the soft g', () => {
    const name = nameElement(
      snapshot('button'),
      locator('role-name', 'button[name="İstanbul Ağrı"]'),
      new Set(),
    )
    expect(name).toBe('istanbulAgriButton')
  })

  it('strips combining accents from other Latin text', () => {
    const name = nameElement(
      snapshot('button'),
      locator('role-name', 'button[name="Café résumé"]'),
      new Set(),
    )
    expect(name).toBe('cafeResumeButton')
  })
})

describe('nameElement — data values in the visible name', () => {
  it('drops the date and price from a calendar cell name', () => {
    const name = nameElement(
      snapshot('button'),
      locator('role-name', 'button[name="Kasım 25 Çarşamba, 2026 6.300 ₺"]'),
      new Set(),
    )
    expect(name).toBe('kasimCarsambaButton')
  })

  it('treats a year or a thousands-grouped number as data even without a currency symbol', () => {
    const date = nameElement(
      snapshot('button'),
      locator('role-name', 'button[name="Tuesday, 2026 Day"]'),
      new Set(),
    )
    const price = nameElement(
      snapshot('button'),
      locator('role-name', 'button[name="Buy now 1,299"]'),
      new Set(),
    )
    expect(date).toBe('tuesdayDayButton')
    expect(price).toBe('buyNowButton')
  })

  it('keeps ordinary digits in names that are not data', () => {
    const name = nameElement(
      snapshot('button'),
      locator('role-name', 'button[name="Step 2"]'),
      new Set(),
    )
    expect(name).toBe('step2Button')
  })

  it('falls back to the original name when stripping would leave nothing', () => {
    const name = nameElement(
      snapshot('button'),
      locator('role-name', 'button[name="2026 6.300 ₺"]'),
      new Set(),
    )
    expect(name).toBe('20266300Button')
  })
})
