import { describe, it, expect } from 'vitest'
import { urlAssertionPattern } from './url-assertion'

describe('urlAssertionPattern', () => {
  it('treats a static route as a substring check', () => {
    expect(urlAssertionPattern('/cart')).toEqual({ kind: 'contains', value: '/cart' })
  })

  it('turns dynamic segments into a regex that stops at the end of the path', () => {
    expect(urlAssertionPattern('/orders/:id')).toEqual({
      kind: 'regex',
      source: '/orders/[^/]+(?:[?#]|$)',
    })
    expect(urlAssertionPattern('/u/:uuid/edit')).toEqual({
      kind: 'regex',
      source: '/u/[^/]+/edit(?:[?#]|$)',
    })
  })

  it('escapes regex metacharacters in the static part', () => {
    expect(urlAssertionPattern('/a.b/:id')).toEqual({
      kind: 'regex',
      source: '/a\\.b/[^/]+(?:[?#]|$)',
    })
  })
})
