import { describe, it, expect } from 'vitest'
import { urlToPageName } from './url-normalizer'

describe('urlToPageName', () => {
  it('names a route from its segments', () => {
    expect(urlToPageName('/')).toBe('Home')
    expect(urlToPageName('/checkout')).toBe('Checkout')
    expect(urlToPageName('/users/:id/settings')).toBe('UsersIdSettings')
  })

  it('drops a leading locale segment', () => {
    expect(urlToPageName('/tr-tr')).toBe('Home')
    expect(urlToPageName('/tr-tr/ucak-bileti/rezervasyon')).toBe('UcakBiletiRezervasyon')
    expect(urlToPageName('/en-us/cart')).toBe('Cart')
    expect(urlToPageName('/pt-br/checkout')).toBe('Checkout')
  })

  it('accepts an uppercase region and an underscore separator', () => {
    expect(urlToPageName('/en-US/cart')).toBe('Cart')
    expect(urlToPageName('/de_DE/cart')).toBe('Cart')
  })

  it('keeps look-alike segments that are not locales', () => {
    expect(urlToPageName('/to-do')).toBe('ToDo')
    expect(urlToPageName('/my-id/profile')).toBe('MyIdProfile')
    expect(urlToPageName('/on-air')).toBe('OnAir')
  })

  it('only strips a locale in the first position', () => {
    expect(urlToPageName('/help/en-us')).toBe('HelpEnUs')
  })
})
