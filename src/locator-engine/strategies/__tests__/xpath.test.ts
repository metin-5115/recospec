import { describe, it, expect, beforeEach } from 'vitest'
import { XPathStrategy } from '../xpath'

const strategy = new XPathStrategy()

function evalXPath(xpath: string): Node[] {
  const snap = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  )
  return Array.from({ length: snap.snapshotLength }, (_, i) => snap.snapshotItem(i)!)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('XPathStrategy', () => {
  it('prefers a name attribute', () => {
    document.body.innerHTML = '<form><input name="email"></form>'
    const el = document.querySelector('input')!
    const loc = strategy.evaluate(el, document)!
    expect(loc.selector).toBe('//input[@name="email"]')
    expect(loc.warning).toBeUndefined()
  })

  it('falls back to a placeholder attribute', () => {
    document.body.innerHTML = '<div><input placeholder="Search"></div>'
    const el = document.querySelector('input')!
    expect(strategy.evaluate(el, document)!.selector).toBe('//input[@placeholder="Search"]')
  })

  it('anchors the path on the nearest ancestor with a stable id', () => {
    document.body.innerHTML =
      '<section id="checkout"><div><span></span><span id="t"></span></div></section>'
    const target = document.getElementById('t')!
    const xpath = strategy.evaluate(target, document)!.selector as string
    expect(xpath.startsWith('//*[@id="checkout"]/')).toBe(true)
    expect(evalXPath(xpath)).toEqual([target])
  })

  it('ignores a dynamic ancestor id and keeps climbing', () => {
    document.body.innerHTML =
      '<main><div id="widget-123456"><button>A</button><button id="t">B</button></div></main>'
    const target = document.getElementById('t')!
    const xpath = strategy.evaluate(target, document)!.selector as string
    expect(xpath).not.toContain('widget-123456')
    expect(evalXPath(xpath)).toEqual([target])
  })

  it('anchors on a unique stable class', () => {
    document.body.innerHTML = '<div class="product-card"><p></p><p id="t"></p></div><div></div>'
    const target = document.getElementById('t')!
    const xpath = strategy.evaluate(target, document)!.selector as string
    expect(xpath).toContain('product-card')
    expect(evalXPath(xpath)).toEqual([target])
  })

  it('does not anchor on a dynamic class', () => {
    document.body.innerHTML = '<div class="css-1a2b3c"><p></p><p id="t"></p></div>'
    const target = document.getElementById('t')!
    const xpath = strategy.evaluate(target, document)!.selector as string
    expect(xpath).not.toContain('css-1a2b3c')
  })

  it('indexes among same-tag siblings only', () => {
    document.body.innerHTML = '<ul id="menu"><li>a</li><li>b</li><li id="t">c</li></ul>'
    const target = document.getElementById('t')!
    const xpath = strategy.evaluate(target, document)!.selector as string
    expect(xpath).toContain('li[3]')
    expect(evalXPath(xpath)).toEqual([target])
  })

  it('flags a fully positional path as absolute', () => {
    document.body.innerHTML = '<div><div><span></span><span id="t"></span></div></div>'
    const target = document.getElementById('t')!
    const loc = strategy.evaluate(target, document)!
    expect(loc.warning).toBe('absolute-xpath')
    expect(evalXPath(loc.selector as string)).toEqual([target])
  })

  it('exposes framework snippets for every runner', () => {
    document.body.innerHTML = '<input name="q">'
    const loc = strategy.evaluate(document.querySelector('input')!, document)!
    expect(loc.framework.playwright).toBe(`page.locator('xpath=//input[@name="q"]')`)
    expect(loc.framework.cypress).toBe('cy.xpath("//input[@name=\\"q\\"]")')
    expect(loc.framework.seleniumPy).toContain('By.XPATH')
  })
})
