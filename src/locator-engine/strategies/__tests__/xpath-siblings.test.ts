import { afterEach, describe, expect, it, vi } from 'vitest'
import { XPathStrategy } from '../xpath'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('XPathStrategy sibling indexing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('indexes the element among same-tag siblings only', () => {
    const doc = parse(
      `<ul id="menu"><li>a</li><li>b</li><span></span><li><button>c</button></li><li>d</li></ul>`,
    )
    const loc = new XPathStrategy().evaluate(doc.querySelector('button') as Element, doc)
    expect(loc?.selector).toBe('//*[@id="menu"]/li[3]/button')
  })

  it('omits the index when the tag is unique among its siblings', () => {
    const doc = parse(`<ul id="menu"><li>a</li><li><button>c</button></li></ul>`)
    const loc = new XPathStrategy().evaluate(doc.querySelector('button') as Element, doc)
    expect(loc?.selector).toBe('//*[@id="menu"]/li[2]/button')
  })

  it('does not enumerate the children collection of long sibling lists', () => {
    const doc = parse(
      `<ul id="menu">${Array.from({ length: 40 })
        .map((_, i) => `<li>${i}</li>`)
        .join('')}</ul>`,
    )
    const children = vi.spyOn(Element.prototype, 'children', 'get')

    const loc = new XPathStrategy().evaluate(doc.querySelectorAll('li')[30] as Element, doc)

    expect(loc?.selector).toBe('//*[@id="menu"]/li[31]')
    expect(children).not.toHaveBeenCalled()
  })
})
