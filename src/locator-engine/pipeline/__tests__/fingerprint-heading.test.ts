import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFingerprint } from '../fingerprint'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function headingFor(html: string, targetSelector: string): string | undefined {
  const doc = parse(html)
  const fingerprint = buildFingerprint(doc.querySelector(targetSelector) as Element, doc)
  return fingerprint.neighborTexts.find((t) => t.startsWith('H:'))
}

describe('fingerprint nearest heading', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('picks the heading that is a direct child of the nearest ancestor', () => {
    const text = headingFor(
      `<section><h2>H: Billing</h2><div><button id="t">Pay</button></div></section>`,
      '#t',
    )
    expect(text).toBe('H: Billing')
  })

  it('ignores headings nested deeper than a direct child', () => {
    const text = headingFor(
      `<section><div><h2>H: Nested</h2></div><div><button id="t">Pay</button></div></section>`,
      '#t',
    )
    expect(text).toBeUndefined()
  })

  it('reads legend, caption and role=heading children', () => {
    expect(
      headingFor(
        `<fieldset><legend>H: Legend</legend><div><input id="t" /></div></fieldset>`,
        '#t',
      ),
    ).toBe('H: Legend')
    expect(
      headingFor(
        `<table><caption>H: Caption</caption><tbody><tr><td><button id="t">x</button></td></tr></tbody></table>`,
        '#t',
      ),
    ).toBe('H: Caption')
    expect(
      headingFor(
        `<div><span role="heading">H: Aria</span><div><button id="t">x</button></div></div>`,
        '#t',
      ),
    ).toBe('H: Aria')
  })

  it('returns the first heading in document order among the direct children', () => {
    const text = headingFor(
      `<section><legend>H: First</legend><h3>H: Second</h3><div><button id="t">x</button></div></section>`,
      '#t',
    )
    expect(text).toBe('H: First')
  })

  it('walks up to a farther ancestor when the nearest ones have no heading', () => {
    const text = headingFor(
      `<main><h1>H: Page</h1><section><div><button id="t">x</button></div></section></main>`,
      '#t',
    )
    expect(text).toBe('H: Page')
  })

  it('never scans an ancestor subtree with a :scope query', () => {
    const doc = parse(
      `<main><ul>${Array.from({ length: 50 })
        .map((_, i) => `<li><button id="b${i}">x</button></li>`)
        .join('')}</ul></main>`,
    )
    const spy = vi.spyOn(Element.prototype, 'querySelector')

    buildFingerprint(doc.querySelector('#b7') as Element, doc)

    expect(spy).not.toHaveBeenCalled()
  })

  it('walks siblings instead of materialising the children collection', () => {
    const doc = parse(
      `<main><ul>${Array.from({ length: 50 })
        .map((_, i) => `<li><button id="b${i}">x</button></li>`)
        .join('')}</ul></main>`,
    )
    const children = vi.spyOn(Element.prototype, 'children', 'get')

    buildFingerprint(doc.querySelector('#b7') as Element, doc)

    expect(children).not.toHaveBeenCalled()
  })
})
