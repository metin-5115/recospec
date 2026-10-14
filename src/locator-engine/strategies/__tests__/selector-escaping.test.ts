import { describe, it, expect, beforeEach } from 'vitest'
import { CssStrategy } from '../css'
import { XPathStrategy } from '../xpath'
import { TestAttributesStrategy } from '../test-attributes'
import { TestIdStrategy } from '../testid'
import { AriaLabelStrategy } from '../aria-label'

/** Values that used to produce a broken (or silently wrong) selector. */
const HOSTILE_VALUES = ['say "hi"', "it's", 'C:\\temp', 'both \' and "', 'two\nlines'] as const

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

describe('CssStrategy — hostile attribute values', () => {
  it.each(HOSTILE_VALUES)('name=%j resolves back to the element', (value) => {
    const el = document.createElement('input')
    el.setAttribute('name', value)
    document.body.appendChild(el)
    const sel = new CssStrategy().evaluate(el, document)!.selector as string
    expect(document.querySelector(sel)).toBe(el)
  })

  it.each(HOSTILE_VALUES)('placeholder=%j resolves back to the element', (value) => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', value)
    document.body.appendChild(el)
    const sel = new CssStrategy().evaluate(el, document)!.selector as string
    expect(document.querySelector(sel)).toBe(el)
  })

  it.each(HOSTILE_VALUES)('href=%j resolves back to the anchor', (value) => {
    const el = document.createElement('a')
    el.setAttribute('href', `/p/${value}`)
    document.body.appendChild(el)
    const sel = new CssStrategy().evaluate(el, document)!.selector as string
    expect(document.querySelector(sel)).toBe(el)
  })
})

describe('XPathStrategy — hostile attribute values', () => {
  it.each(HOSTILE_VALUES)('name=%j is a valid XPath that finds the element', (value) => {
    const el = document.createElement('input')
    el.setAttribute('name', value)
    document.body.appendChild(el)
    const xpath = new XPathStrategy().evaluate(el, document)!.selector as string
    expect(evalXPath(xpath)).toEqual([el])
  })

  it.each(HOSTILE_VALUES)('placeholder=%j is a valid XPath that finds the element', (value) => {
    const el = document.createElement('input')
    el.setAttribute('placeholder', value)
    document.body.appendChild(el)
    const xpath = new XPathStrategy().evaluate(el, document)!.selector as string
    expect(evalXPath(xpath)).toEqual([el])
  })

  it.each(HOSTILE_VALUES)('an ancestor id=%j anchors a valid XPath', (value) => {
    const wrap = document.createElement('section')
    wrap.id = value
    const a = document.createElement('span')
    const b = document.createElement('span')
    wrap.append(a, b)
    document.body.appendChild(wrap)
    const xpath = new XPathStrategy().evaluate(b, document)!.selector as string
    expect(evalXPath(xpath)).toEqual([b])
  })

  it('a stable class containing a quote does not break the class predicate', () => {
    const card = document.createElement('div')
    card.className = "it's-card"
    const inner = document.createElement('span')
    const sibling = document.createElement('span')
    card.append(inner, sibling)
    document.body.appendChild(card)
    const xpath = new XPathStrategy().evaluate(sibling, document)!.selector as string
    expect(evalXPath(xpath)).toEqual([sibling])
  })
})

describe('TestAttributesStrategy / AriaLabelStrategy — hostile values', () => {
  it.each(HOSTILE_VALUES)('data-qa=%j resolves back to the element', (value) => {
    const el = document.createElement('button')
    el.setAttribute('data-qa', value)
    document.body.appendChild(el)
    const sel = new TestAttributesStrategy().evaluate(el, document)!.selector as string
    expect(document.querySelector(sel)).toBe(el)
  })

  it.each(HOSTILE_VALUES)('aria-label=%j resolves back to the element', (value) => {
    const el = document.createElement('button')
    el.setAttribute('aria-label', value)
    document.body.appendChild(el)
    const sel = new AriaLabelStrategy().evaluate(el, document)!.selector as string
    expect(document.querySelector(sel)).toBe(el)
  })
})

describe('TestIdStrategy — generated framework snippets', () => {
  it('keeps the legacy single-quoted form for ordinary ids', () => {
    const el = document.createElement('button')
    el.setAttribute('data-testid', 'submit')
    document.body.appendChild(el)
    const loc = new TestIdStrategy().evaluate(el, document)!
    expect(loc.framework.playwright).toBe("page.getByTestId('submit')")
    expect(loc.framework.cypress).toBe(`cy.get('[data-testid="submit"]')`)
  })

  it('escapes a quote so the generated JS stays valid', () => {
    const el = document.createElement('button')
    el.setAttribute('data-testid', "it's")
    document.body.appendChild(el)
    const loc = new TestIdStrategy().evaluate(el, document)!
    expect(loc.framework.playwright).toBe("page.getByTestId('it\\'s')")
    expect(loc.framework.cypress).toBe(`cy.get('[data-testid="it\\'s"]')`)
  })

  it('escapes a double quote inside the CSS attribute selector', () => {
    const el = document.createElement('button')
    el.setAttribute('data-testid', 'say "hi"')
    document.body.appendChild(el)
    const loc = new TestIdStrategy().evaluate(el, document)!
    expect(loc.framework.cypress).toBe(`cy.get('[data-testid="say \\\\"hi\\\\""]')`)
  })
})
