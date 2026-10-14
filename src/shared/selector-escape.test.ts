import { describe, it, expect } from 'vitest'
import { cssAttrValue, jsSingleQuoted, xpathLiteral } from './selector-escape'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function evalXPath(doc: Document, xpath: string): Node[] {
  const snap = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
  return Array.from({ length: snap.snapshotLength }, (_, i) => snap.snapshotItem(i)!)
}

describe('cssAttrValue', () => {
  it('leaves ordinary values untouched', () => {
    expect(cssAttrValue('submit-btn')).toBe('submit-btn')
  })

  it('escapes quotes, backslashes and newlines so the value stays inside "…"', () => {
    expect(cssAttrValue('say "hi"')).toBe('say \\"hi\\"')
    expect(cssAttrValue('C:\\temp')).toBe('C:\\\\temp')
    expect(cssAttrValue('a\nb')).toBe('a\\a b')
  })

  it.each(['plain', 'has "double" quotes', "it's", 'back\\slash', 'new\nline', 'mix "\' \\'])(
    'round-trips %j through querySelector',
    (value) => {
      const doc = parse('<div></div>')
      const el = doc.createElement('input')
      el.setAttribute('name', value)
      doc.body.appendChild(el)
      expect(doc.querySelector(`input[name="${cssAttrValue(value)}"]`)).toBe(el)
    },
  )
})

describe('xpathLiteral', () => {
  it('prefers single quotes by default and double quotes on request', () => {
    expect(xpathLiteral('abc')).toBe("'abc'")
    expect(xpathLiteral('abc', '"')).toBe('"abc"')
  })

  it('switches quote style when the preferred one occurs in the value', () => {
    expect(xpathLiteral("it's")).toBe('"it\'s"')
    expect(xpathLiteral('say "hi"', '"')).toBe('\'say "hi"\'')
  })

  it.each([
    ['plain', 'single'],
    ["it's", 'single'],
    ['say "hi"', 'single'],
    ['both \' and "', 'single'],
    ['both \' and "', 'double'],
    ["trailing'", 'double'],
  ] as const)('round-trips %j (%s-preferred) through document.evaluate', (value, pref) => {
    const doc = parse('<div></div>')
    const el = doc.createElement('input')
    el.setAttribute('name', value)
    doc.body.appendChild(el)
    const literal = xpathLiteral(value, pref === 'single' ? "'" : '"')
    expect(evalXPath(doc, `//input[@name=${literal}]`)).toEqual([el])
  })
})

describe('jsSingleQuoted', () => {
  it('matches the legacy single-quoted form for ordinary values', () => {
    expect(jsSingleQuoted('submit')).toBe("'submit'")
  })

  it('escapes quotes, backslashes and newlines', () => {
    expect(jsSingleQuoted("it's")).toBe("'it\\'s'")
    expect(jsSingleQuoted('a\\b')).toBe("'a\\\\b'")
    expect(jsSingleQuoted('a\nb')).toBe("'a\\nb'")
  })

  it('evaluates back to the original value', () => {
    const value = `mix ' " \\ \n end`
    expect(new Function(`return ${jsSingleQuoted(value)}`)()).toBe(value)
  })
})
