import { describe, it, expect, beforeEach } from 'vitest'
import { IMPLICIT_ROLE_TABLE, selectorForRole } from '../role-table'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('IMPLICIT_ROLE_TABLE', () => {
  it('has no duplicate selectors', () => {
    const selectors = IMPLICIT_ROLE_TABLE.map((e) => e.selector)
    expect(new Set(selectors).size).toBe(selectors.length)
  })

  it('deliberately gives password inputs no role', () => {
    expect(IMPLICIT_ROLE_TABLE.some((e) => e.selector.includes('password'))).toBe(false)
  })
})

describe('selectorForRole', () => {
  it('always includes the explicit role attribute form', () => {
    expect(selectorForRole('tab').split(', ')).toContain('[role="tab"]')
  })

  it('adds every implicit host element for the role', () => {
    const parts = selectorForRole('heading').split(', ')
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) expect(parts).toContain(level)
  })

  it('matches implicit and explicit carriers of a role, nothing else', () => {
    document.body.innerHTML =
      '<button id="a">A</button><div role="button" id="b">B</div><span id="c">C</span>' +
      '<input type="submit" id="d"><input type="password" id="e">'
    const ids = Array.from(document.querySelectorAll(selectorForRole('button'))).map((e) => e.id)
    expect(ids).toEqual(['a', 'b', 'd'])
  })

  it('returns only the explicit form for a role with no implicit host', () => {
    expect(selectorForRole('tooltip')).toBe('[role="tooltip"]')
  })

  it('treats a typeless input as a textbox but not a password input', () => {
    document.body.innerHTML =
      '<input id="t"><input type="password" id="p"><textarea id="a"></textarea>'
    const ids = Array.from(document.querySelectorAll(selectorForRole('textbox'))).map((e) => e.id)
    expect(ids).toContain('t')
    expect(ids).toContain('a')
    expect(ids).not.toContain('p')
  })

  it('splits <select> into listbox (multiple) and combobox', () => {
    document.body.innerHTML = '<select id="s"></select><select multiple id="m"></select>'
    const combo = Array.from(document.querySelectorAll(selectorForRole('combobox'))).map(
      (e) => e.id,
    )
    const list = Array.from(document.querySelectorAll(selectorForRole('listbox'))).map((e) => e.id)
    expect(combo).toContain('s')
    expect(list).toEqual(['m'])
  })
})
