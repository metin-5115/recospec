import { describe, it, expect, beforeEach } from 'vitest'
import { score } from '../../scoring/stability-scorer'
import type { Locator } from '@shared/types/locator'

describe('stability-scorer', () => {
  let doc: Document
  let el: Element

  beforeEach(() => {
    doc = document
    document.body.innerHTML = ''
    el = document.createElement('button')
    document.body.appendChild(el)
  })

  it('testid locator scores highest (100)', () => {
    const locator: Locator = {
      strategy: 'testid',
      selector: 'submit-btn',
      framework: {},
    }
    expect(score(locator, el, doc)).toBe(100)
  })

  it('css locator scores lower than aria-label', () => {
    const ariaLocator: Locator = {
      strategy: 'aria-label',
      selector: '[aria-label="Submit"]',
      framework: {},
    }
    const cssLocator: Locator = {
      strategy: 'css',
      selector: 'form > button',
      framework: {},
    }
    expect(score(ariaLocator, el, doc)).toBeGreaterThan(score(cssLocator, el, doc))
  })

  it('xpath locator scores lower than css when css selector matches element', () => {
    el.setAttribute('type', 'submit')
    const cssLocator: Locator = {
      strategy: 'css',
      selector: 'button[type="submit"]',
      framework: {},
    }
    const xpathLocator: Locator = {
      strategy: 'xpath',
      selector: '//form/div/button',
      framework: {},
    }
    expect(score(cssLocator, el, doc)).toBeGreaterThan(score(xpathLocator, el, doc))
  })

  it('depth penalty: more combinators = lower depth score', () => {
    const shallow: Locator = {
      strategy: 'css',
      selector: 'button',
      framework: {},
    }
    const deep: Locator = {
      strategy: 'css',
      selector: 'div > form > fieldset > button',
      framework: {},
    }
    expect(score(shallow, el, doc)).toBeGreaterThan(score(deep, el, doc))
  })

  it('applies formula: uniqueness*0.4 + semantic*0.3 + stability*0.2 + depth*0.1', () => {
    el.setAttribute('data-testid', 'my-btn')
    const locator: Locator = {
      strategy: 'testid',
      selector: 'my-btn',
      framework: {},
    }
    const s = score(locator, el, doc)
    // testid: uniqueness=100, semantic=100, stability=100, depth=100
    expect(s).toBe(100)
  })
})
