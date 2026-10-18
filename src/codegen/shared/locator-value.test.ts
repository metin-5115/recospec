import { describe, it, expect } from 'vitest'
import { parseRoleName, roleNameXPath, labelXPath, xpathLiteral } from './locator-value'

describe('parseRoleName', () => {
  it('reads the engine format role[name="…"]', () => {
    expect(parseRoleName('button[name="Apply"]')).toEqual({ role: 'button', name: 'Apply' })
  })

  it('keeps quotes and brackets inside the engine-format name', () => {
    expect(parseRoleName('radio[name="Express (+$12) "fast""]')).toEqual({
      role: 'radio',
      name: 'Express (+$12) "fast"',
    })
  })

  it('reads the legacy Playwright-argument format', () => {
    expect(parseRoleName(`'textbox', { name: 'Email' }`)).toEqual({
      role: 'textbox',
      name: 'Email',
    })
  })

  it('reads a JSON-serialized selector object', () => {
    expect(parseRoleName('{"role":"link","name":"Cart"}')).toEqual({ role: 'link', name: 'Cart' })
  })

  it('reads a bare role with no name', () => {
    expect(parseRoleName('navigation')).toEqual({ role: 'navigation' })
  })

  it('rejects values that are not role locators', () => {
    expect(parseRoleName('#cart-link')).toBeNull()
    expect(parseRoleName('div.card > p')).toBeNull()
    expect(parseRoleName('')).toBeNull()
  })
})

describe('xpathLiteral', () => {
  it('uses single quotes, double quotes, or concat() as needed', () => {
    expect(xpathLiteral('Apply')).toBe(`'Apply'`)
    expect(xpathLiteral(`Don't`)).toBe(`"Don't"`)
    expect(xpathLiteral(`a'b"c`)).toBe(`concat('a', "'", 'b"c')`)
  })
})

function evaluateAll(xpath: string, html: string): Element[] {
  document.body.innerHTML = html
  const result = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  )
  const nodes: Element[] = []
  for (let i = 0; i < result.snapshotLength; i++) nodes.push(result.snapshotItem(i) as Element)
  return nodes
}

const FORM = `
  <form>
    <label for="promo">Promo code</label><input id="promo" type="text">
    <label for="email">Email</label><input id="email" type="email">
    <label><input type="checkbox" id="news"> Email me updates</label>
    <label><input type="radio" name="ship"> Express (+$12)</label>
    <input type="text" aria-label="Search">
    <textarea placeholder="Delivery notes"></textarea>
    <button type="button">Apply</button>
    <input type="submit" value="Place order">
    <div role="button"><span>Checkout</span></div>
    <a href="/cart">Cart</a>
  </form>`

describe('roleNameXPath', () => {
  it('finds a text input by its <label for> name, not the first input', () => {
    const [el] = evaluateAll(roleNameXPath('textbox', 'Promo code', 'input'), FORM)
    expect(el?.id).toBe('promo')
    expect(evaluateAll(roleNameXPath('textbox', 'Email', 'input'), FORM).map((e) => e.id)).toEqual([
      'email',
    ])
  })

  it('finds a control wrapped by its label', () => {
    const matches = evaluateAll(roleNameXPath('radio', 'Express (+$12)', 'input'), FORM)
    expect(matches).toHaveLength(1)
    expect(matches[0]?.getAttribute('type')).toBe('radio')
  })

  it('finds buttons by text and by value', () => {
    expect(evaluateAll(roleNameXPath('button', 'Apply', 'button'), FORM)).toHaveLength(1)
    const [submit] = evaluateAll(roleNameXPath('button', 'Place order', 'input'), FORM)
    expect(submit?.getAttribute('value')).toBe('Place order')
  })

  it('finds aria-label and placeholder names', () => {
    expect(evaluateAll(roleNameXPath('textbox', 'Search', 'input'), FORM)).toHaveLength(1)
    expect(evaluateAll(roleNameXPath('textbox', 'Delivery notes', 'textarea'), FORM)).toHaveLength(
      1,
    )
  })

  it('resolves explicit and implicit roles when the tag is unknown', () => {
    const [div] = evaluateAll(roleNameXPath('button', 'Checkout', '*'), FORM)
    expect(div?.tagName).toBe('DIV')
    const [link] = evaluateAll(roleNameXPath('link', 'Cart', '*'), FORM)
    expect(link?.tagName).toBe('A')
  })

  it('collapses whitespace in the recorded name', () => {
    expect(evaluateAll(roleNameXPath('textbox', '  Promo\n  code ', 'input'), FORM)).toHaveLength(1)
  })

  it('handles names with both quote kinds', () => {
    const xpath = roleNameXPath('button', `Say "hi" it's`, 'button')
    expect(evaluateAll(xpath, `<button>Say "hi" it's</button>`)).toHaveLength(1)
  })

  it('omits the name predicate for a nameless role', () => {
    expect(roleNameXPath('navigation', undefined, 'nav')).toBe('//nav')
  })
})

describe('labelXPath', () => {
  it('finds the control a <label for> points at', () => {
    const [el] = evaluateAll(labelXPath('Promo code', '*'), FORM)
    expect(el?.id).toBe('promo')
  })

  it('finds a control wrapped by its label', () => {
    const [el] = evaluateAll(labelXPath('Express (+$12)', '*'), FORM)
    expect(el?.getAttribute('type')).toBe('radio')
  })

  it('does not match a different label that merely contains the text', () => {
    expect(evaluateAll(labelXPath('Email', 'input'), FORM).map((e) => e.id)).toEqual(['email'])
  })
})
