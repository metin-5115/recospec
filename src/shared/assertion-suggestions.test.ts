import { describe, it, expect } from 'vitest'
import { suggestionsForSnapshot, urlAssertionSuggestion } from './assertion-suggestions'
import type { ElementSnapshot } from './types/action'

const buttonSnap: ElementSnapshot = {
  tagName: 'button',
  attributes: { id: 'go' },
  textContent: 'Submit',
}

const inputSnap: ElementSnapshot = {
  tagName: 'input',
  attributes: { type: 'text', value: 'alice' },
  textContent: '',
}

describe('suggestionsForSnapshot', () => {
  it('always offers visible + hidden + screenshot', () => {
    const types = suggestionsForSnapshot(buttonSnap, 'Form').map((s) => s.type)
    expect(types).toContain('visible')
    expect(types).toContain('hidden')
    expect(types).toContain('screenshot')
  })

  it('includes a text assertion when the snapshot has text', () => {
    const list = suggestionsForSnapshot(buttonSnap, 'Form')
    const text = list.find((s) => s.type === 'text')
    expect(text).toBeDefined()
    expect(text?.expected).toBe('Submit')
  })

  it('includes a text-contains assertion alongside the exact text match', () => {
    const list = suggestionsForSnapshot(buttonSnap, 'Form')
    const contains = list.find((s) => s.type === 'text-contains')
    expect(contains).toBeDefined()
    expect(contains?.expected).toBe('Submit')
    expect(contains?.label).toContain('contains')
  })

  it('omits text-contains when the snapshot has no text', () => {
    const list = suggestionsForSnapshot(inputSnap, 'Login')
    expect(list.find((s) => s.type === 'text-contains')).toBeUndefined()
  })

  it('includes a value assertion for inputs, preferring the live current value', () => {
    const list = suggestionsForSnapshot(inputSnap, 'Login', 'live-value')
    const value = list.find((s) => s.type === 'value')
    expect(value?.expected).toBe('live-value')
  })

  it('falls back to the snapshot value attribute when no live value is supplied', () => {
    const list = suggestionsForSnapshot(inputSnap, 'Login')
    const value = list.find((s) => s.type === 'value')
    expect(value?.expected).toBe('alice')
  })

  it('slugifies the page title for the screenshot file name', () => {
    const list = suggestionsForSnapshot(buttonSnap, 'Hello / World!  Test')
    const screenshot = list.find((s) => s.type === 'screenshot')
    expect(screenshot?.name).toBe('hello-world-test')
  })

  it('defaults the screenshot name to "snapshot" when the page title is empty', () => {
    const list = suggestionsForSnapshot(buttonSnap, '')
    const screenshot = list.find((s) => s.type === 'screenshot')
    expect(screenshot?.name).toBe('snapshot')
  })
})

const priceSnap: ElementSnapshot = {
  tagName: 'p',
  attributes: {},
  textContent: '294.840 TRY',
}

describe('suggestionsForSnapshot — dynamic value', () => {
  it('offers not-empty + matches but NOT exact text (which would break as it changes)', () => {
    const types = suggestionsForSnapshot(priceSnap, 'Hotels').map((s) => s.type)
    expect(types).toContain('not-empty')
    expect(types).toContain('matches')
    expect(types).not.toContain('text')
  })

  it('the matches default is a shape regex that omits the literal digits', () => {
    const m = suggestionsForSnapshot(priceSnap, 'Hotels').find((s) => s.type === 'matches')
    expect(String(m?.expected)).toContain('\\d+')
    expect(String(m?.expected)).not.toContain('294')
  })

  it('offers a stable-substring contains (the unit word, not the number)', () => {
    const c = suggestionsForSnapshot(priceSnap, 'Hotels').find((s) => s.type === 'text-contains')
    expect(c?.expected).toBe('TRY')
  })
})

describe('URL suggestion', () => {
  it('suggestionsForSnapshot offers the route of the page, with dynamic segments normalized', () => {
    const list = suggestionsForSnapshot(
      buttonSnap,
      'Order',
      undefined,
      'https://shop.test/orders/42?x=1',
    )
    const url = list.find((s) => s.type === 'url')
    expect(url?.expected).toBe('/orders/:id')
    expect(url?.label).toBe('Expect URL contains: /orders/:id')
  })

  it('is left out when the page URL is unknown', () => {
    expect(suggestionsForSnapshot(buttonSnap, 'Order').map((s) => s.type)).not.toContain('url')
  })

  it('urlAssertionSuggestion returns nothing for a page without a route', () => {
    expect(urlAssertionSuggestion('about:blank')).toBeUndefined()
  })
})
