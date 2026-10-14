import { describe, it, expect, beforeEach } from 'vitest'
import {
  PlaceholderStrategy,
  AltStrategy,
  TitleStrategy,
  NameAttributeStrategy,
  HrefStrategy,
} from '../attribute-strategies'

function make(tag: string, attrs: Record<string, string> = {}): Element {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('PlaceholderStrategy', () => {
  const strategy = new PlaceholderStrategy()

  it('builds a placeholder selector and getByPlaceholder', () => {
    const loc = strategy.evaluate(make('input', { placeholder: 'Search products' }))!
    expect(loc.strategy).toBe('placeholder')
    expect(loc.selector).toBe('[placeholder="Search products"]')
    expect(loc.framework.playwright).toBe('page.getByPlaceholder("Search products")')
  })

  it('returns null without a placeholder', () => {
    expect(strategy.evaluate(make('input'))).toBeNull()
  })

  it('returns null for a whitespace-only placeholder', () => {
    expect(strategy.evaluate(make('input', { placeholder: '   ' }))).toBeNull()
  })

  it('trims the value before building the selector', () => {
    const loc = strategy.evaluate(make('input', { placeholder: '  Email  ' }))!
    expect(loc.selector).toBe('[placeholder="Email"]')
  })
})

describe('AltStrategy', () => {
  const strategy = new AltStrategy()

  it('builds an alt selector and getByAltText', () => {
    const loc = strategy.evaluate(make('img', { alt: 'Company logo' }))!
    expect(loc.selector).toBe('[alt="Company logo"]')
    expect(loc.framework.playwright).toBe('page.getByAltText("Company logo")')
  })

  it('returns null for an image without alt', () => {
    expect(strategy.evaluate(make('img'))).toBeNull()
  })

  it('returns null for an intentionally empty alt (decorative image)', () => {
    expect(strategy.evaluate(make('img', { alt: '' }))).toBeNull()
  })

  it('escapes a quote inside the alt text', () => {
    const el = make('img', { alt: 'The "best" one' })
    const loc = strategy.evaluate(el)!
    expect(document.querySelector(loc.selector as string)).toBe(el)
  })
})

describe('TitleStrategy', () => {
  const strategy = new TitleStrategy()

  it('builds a title selector and getByTitle', () => {
    const loc = strategy.evaluate(make('button', { title: 'Close dialog' }))!
    expect(loc.selector).toBe('[title="Close dialog"]')
    expect(loc.framework.playwright).toBe('page.getByTitle("Close dialog")')
  })

  it('returns null without a title', () => {
    expect(strategy.evaluate(make('button'))).toBeNull()
  })

  it('works on any element, not just form controls', () => {
    const loc = strategy.evaluate(make('span', { title: 'Hint' }))!
    expect(loc.selector).toBe('[title="Hint"]')
  })

  it('escapes a backslash inside the title', () => {
    const el = make('span', { title: 'C:' + String.fromCharCode(92) + 'tmp' })
    const loc = strategy.evaluate(el)!
    expect(document.querySelector(loc.selector as string)).toBe(el)
  })
})

describe('NameAttributeStrategy', () => {
  const strategy = new NameAttributeStrategy()

  it('builds a tag-scoped name selector for an input', () => {
    const loc = strategy.evaluate(make('input', { name: 'email' }))!
    expect(loc.selector).toBe('input[name="email"]')
    expect(loc.framework.seleniumPy).toBe('driver.find_element(By.NAME, "email")')
  })

  it.each(['input', 'select', 'textarea', 'button'])('accepts <%s>', (tag) => {
    expect(strategy.evaluate(make(tag, { name: 'x' }))).not.toBeNull()
  })

  it.each(['meta', 'a', 'div', 'iframe'])('ignores name on <%s>', (tag) => {
    expect(strategy.evaluate(make(tag, { name: 'x' }))).toBeNull()
  })

  it('returns null for an empty name', () => {
    expect(strategy.evaluate(make('input', { name: ' ' }))).toBeNull()
  })
})

describe('HrefStrategy', () => {
  const strategy = new HrefStrategy()

  it('uses an exact match when the href has no query', () => {
    const loc = strategy.evaluate(make('a', { href: '/pricing' }))!
    expect(loc.selector).toBe('a[href="/pricing"]')
  })

  it('strips the query string and switches to a prefix match', () => {
    const loc = strategy.evaluate(make('a', { href: '/search?q=shoes&page=2' }))!
    expect(loc.selector).toBe('a[href^="/search"]')
  })

  it('strips a fragment the same way', () => {
    const loc = strategy.evaluate(make('a', { href: '/docs#install' }))!
    expect(loc.selector).toBe('a[href^="/docs"]')
  })

  it.each(['#', 'javascript:void(0)', ''])('returns null for href %j', (href) => {
    expect(strategy.evaluate(make('a', { href }))).toBeNull()
  })

  it('returns null for an anchor without href', () => {
    expect(strategy.evaluate(make('a'))).toBeNull()
  })

  it('returns null for a non-anchor element', () => {
    expect(strategy.evaluate(make('div', { href: '/x' }))).toBeNull()
  })

  it('returns null when only a query remains after stripping', () => {
    expect(strategy.evaluate(make('a', { href: '?tab=2' }))).toBeNull()
  })
})
