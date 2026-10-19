import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocatorEngine } from '../index'
import { XPathStrategy } from '../strategies/xpath'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const hasXPath = (bundle: { allCandidates: { strategy: string }[] }): boolean =>
  bundle.allCandidates.some((c) => c.strategy === 'xpath')

describe('LocatorEngine XPath gate', () => {
  const engine = new LocatorEngine()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('never builds or resolves an XPath when healthy flat survivors already fill the bundle', () => {
    const doc = parse(
      `<form>
        <label for="email">Email Address</label>
        <input id="email" data-testid="email" name="email" placeholder="user@example.com" />
      </form>`,
    )
    const build = vi.spyOn(XPathStrategy.prototype, 'evaluate')
    const xpathEval = vi.spyOn(doc, 'evaluate')

    const bundle = engine.evaluate(doc.querySelector('input') as Element, doc)

    expect(bundle).not.toBeNull()
    expect(build).not.toHaveBeenCalled()
    expect(xpathEval).not.toHaveBeenCalled()
    expect(hasXPath(bundle!)).toBe(false)
    expect(bundle!.primary.strategy).toBe('testid')
  })

  it('keeps the primary identical to the ungated pipeline when the gate skips XPath', () => {
    const doc = parse(
      `<ul id="catalog">${Array.from({ length: 30 })
        .map((_, i) => `<li class="row"><button aria-label="Edit ${i}">Edit</button></li>`)
        .join('')}</ul>`,
    )
    const target = doc.querySelectorAll('button')[7] as Element
    const bundle = engine.evaluate(target, doc)!

    expect(bundle.primary.selector).toBe('[aria-label="Edit 7"]')
    expect(bundle.fallbacks.map((f) => f.strategy)).toEqual(['role-name'])
  })

  it('still builds an XPath when no healthy flat survivor exists (last-resort primary)', () => {
    const doc = parse(`<section><p>one</p><p>two</p><span>a</span><span>b</span></section>`)
    const build = vi.spyOn(XPathStrategy.prototype, 'evaluate')

    const bundle = engine.evaluate(doc.querySelectorAll('span')[1] as Element, doc)

    expect(build).toHaveBeenCalledTimes(1)
    expect(bundle).not.toBeNull()
    expect(hasXPath(bundle!)).toBe(true)
  })

  it('keeps XPath as the universal fallback when only one healthy survivor exists', () => {
    const doc = parse(`<div><i id="only-id"></i><i></i><i></i></div>`)
    const build = vi.spyOn(XPathStrategy.prototype, 'evaluate')

    const bundle = engine.evaluate(doc.querySelector('#only-id') as Element, doc)

    expect(build).toHaveBeenCalledTimes(1)
    expect(bundle!.primary.selector).toBe('#only-id')
    expect(bundle!.fallbacks.map((f) => f.strategy)).toContain('xpath')
  })

  it('builds an XPath when the best flat survivor is below the primary-safe score', () => {
    // Only a stable-class css selector survives (score ~50): an attribute XPath
    // could outrank it, so the gate must stay open.
    const doc = parse(
      `<div><a class="cta">x</a><a class="cta">x</a><span class="solo-badge"></span></div>`,
    )
    const build = vi.spyOn(XPathStrategy.prototype, 'evaluate')

    engine.evaluate(doc.querySelector('.solo-badge') as Element, doc)

    expect(build).toHaveBeenCalledTimes(1)
  })
})
