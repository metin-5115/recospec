import { describe, it, expect } from 'vitest'
import { escapeXml, xmlBlock, xmlText } from './prompt-xml'

describe('escapeXml', () => {
  it('escapes ampersand, angle brackets and double quotes', () => {
    expect(escapeXml(`a & b < c > d "e"`)).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;')
  })
})

describe('xmlBlock', () => {
  it('self-closes when there are no children and skips undefined attrs', () => {
    expect(xmlBlock('scenario', { name: 'x', skipped: undefined, n: 2, on: true })).toBe(
      '<scenario name="x" n="2" on="true"/>',
    )
  })

  it('indents nested children', () => {
    const xml = xmlBlock('a', {}, [xmlBlock('b', {}, [xmlBlock('c')])])
    expect(xml).toBe('<a>\n  <b>\n    <c/>\n  </b>\n</a>')
  })
})

describe('xmlText', () => {
  it('escapes text content and attribute values', () => {
    expect(xmlText('locator', { strategy: 'css' }, 'a > b')).toBe(
      '<locator strategy="css">a &gt; b</locator>',
    )
  })
})
