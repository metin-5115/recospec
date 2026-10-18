import { describe, it, expect } from 'vitest'
import {
  isFragileLocator,
  semanticDomPath,
  isStateAttribute,
  isUsableFallback,
} from './llm-context-noise'

describe('isFragileLocator', () => {
  it('flags CSS-module hashed classes in css and xpath', () => {
    expect(isFragileLocator('button.hm__style_thyButton__1O245.hm__style_button__QxvpK')).toBe(true)
    expect(
      isFragileLocator(
        "//div[contains(concat(' ', normalize-space(@class), ' '), \" hm__style_dropdown__3tpXH \")]/button",
      ),
    ).toBe(true)
  })

  it('flags hash classes that end with an underscore', () => {
    expect(isFragileLocator('button.hm__style_priceCalendarBestPrice__XUS8_')).toBe(true)
  })

  it('flags transient state modifiers such as --hover', () => {
    expect(isFragileLocator('button.react-calendar__tile--hover')).toBe(true)
    expect(isFragileLocator('li.menu__item--active')).toBe(true)
  })

  it('keeps semantic BEM classes and attribute locators', () => {
    expect(isFragileLocator('button.react-calendar__month-view__days__day')).toBe(false)
    expect(isFragileLocator('div.card__header')).toBe(false)
    expect(isFragileLocator('#buttonUcusara')).toBe(false)
    expect(isFragileLocator('button[name="Search"]')).toBe(false)
  })
})

describe('isUsableFallback', () => {
  it('rejects fragile fallbacks', () => {
    expect(isUsableFallback({ strategy: 'css', value: 'a.x__y_z__AbC12' }, 'tid:main')).toBe(false)
  })

  it('rejects fallbacks longer than the cap', () => {
    const long = `//div[${'a'.repeat(200)}]`
    expect(isUsableFallback({ strategy: 'xpath', value: long }, 'tid:x')).toBe(false)
  })

  it('rejects a fallback that repeats the primary', () => {
    expect(isUsableFallback({ strategy: 'id', value: '#a' }, 'id:#a')).toBe(false)
  })

  it('accepts a short semantic fallback', () => {
    expect(
      isUsableFallback({ strategy: 'label', value: 'Email' }, 'aria:[aria-label="Email"]'),
    ).toBe(true)
  })
})

describe('isStateAttribute', () => {
  it('flags volatile UI-state attributes', () => {
    for (const name of [
      'aria-expanded',
      'aria-selected',
      'aria-current',
      'tabindex',
      'aria-hidden',
    ]) {
      expect(isStateAttribute(name)).toBe(true)
    }
  })

  it('keeps identity attributes', () => {
    for (const name of ['id', 'name', 'type', 'role', 'autocomplete', 'data-testid', 'href']) {
      expect(isStateAttribute(name)).toBe(false)
    }
  })
})

describe('semanticDomPath', () => {
  it('drops div and span ancestors but keeps semantic ones', () => {
    expect(semanticDomPath('body>main>form>div>div>input', 4)).toBe('main>form>input')
  })

  it('is undefined when no semantic ancestor exists', () => {
    expect(semanticDomPath('body>div>div>div>button', 4)).toBeUndefined()
    expect(semanticDomPath('button', 4)).toBeUndefined()
    expect(semanticDomPath('', 4)).toBeUndefined()
  })

  it('keeps only the nearest ancestors up to the limit, plus the element', () => {
    expect(semanticDomPath('body>main>section>article>form>ul>li', 3)).toBe('article>form>ul>li')
  })
})
