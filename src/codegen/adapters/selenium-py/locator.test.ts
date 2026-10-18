import { describe, it, expect } from 'vitest'
import { renderLocatorTuple, renderFallbackTuple } from './locator'
import type { IRElement } from '../../ir/types'

describe('selenium-py renderLocatorTuple', () => {
  it('emits By.CSS_SELECTOR for testid strategy', () => {
    const el: IRElement = {
      name: 'emailInput',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="login-email"]',
      tagName: 'input',
    }
    expect(renderLocatorTuple(el)).toBe(`(By.CSS_SELECTOR, '[data-testid="login-email"]')`)
  })

  it('emits By.CSS_SELECTOR for aria-label strategy', () => {
    const el: IRElement = {
      name: 'emailInput',
      locatorStrategy: 'aria-label',
      locatorValue: '[aria-label="Email"]',
      tagName: 'input',
    }
    expect(renderLocatorTuple(el)).toBe(`(By.CSS_SELECTOR, '[aria-label="Email"]')`)
  })

  it('emits By.XPATH for role-name strategy with tagName', () => {
    const el: IRElement = {
      name: 'signInButton',
      locatorStrategy: 'role-name',
      locatorValue: `'button', { name: 'Sign In' }`,
      tagName: 'button',
    }
    expect(renderLocatorTuple(el)).toBe(
      `(By.XPATH, "//button[normalize-space(.)='Sign In' or @value='Sign In' or @aria-label='Sign In']")`,
    )
  })

  it('emits By.XPATH for text strategy', () => {
    const el: IRElement = {
      name: 'welcome',
      locatorStrategy: 'text',
      locatorValue: 'Welcome, QA Tester',
      tagName: 'div',
    }
    expect(renderLocatorTuple(el)).toBe(`(By.XPATH, "//*[normalize-space()='Welcome, QA Tester']")`)
  })

  it('emits By.ID stripping leading hash', () => {
    const el: IRElement = {
      name: 'username',
      locatorStrategy: 'id',
      locatorValue: '#username',
      tagName: 'input',
    }
    expect(renderLocatorTuple(el)).toBe(`(By.ID, 'username')`)
  })

  it('emits By.XPATH passthrough', () => {
    const el: IRElement = {
      name: 'foo',
      locatorStrategy: 'xpath',
      locatorValue: "//div[@class='foo']",
      tagName: 'div',
    }
    expect(renderLocatorTuple(el)).toBe(`(By.XPATH, "//div[@class='foo']")`)
  })

  it('falls back to By.CSS_SELECTOR for css strategy', () => {
    const el: IRElement = {
      name: 'foo',
      locatorStrategy: 'css',
      locatorValue: '.foo > .bar',
      tagName: 'div',
    }
    expect(renderLocatorTuple(el)).toBe(`(By.CSS_SELECTOR, '.foo > .bar')`)
  })

  it('uses concat() XPath literal for text containing both quote types', () => {
    const el: IRElement = {
      name: 'mixed',
      locatorStrategy: 'text',
      locatorValue: `O'Reilly says "hi"`,
      tagName: 'div',
    }
    const out = renderLocatorTuple(el)
    expect(out.startsWith('(By.XPATH,')).toBe(true)
    expect(out).toContain('concat(')
  })
})

describe('selenium-py renderFallbackTuple', () => {
  it('produces matching tuples for fallback strategies', () => {
    expect(
      renderFallbackTuple({ strategy: 'aria-label', locatorValue: '[aria-label="Email"]' }),
    ).toBe(`(By.CSS_SELECTOR, '[aria-label="Email"]')`)

    expect(
      renderFallbackTuple({
        strategy: 'role-name',
        locatorValue: `'textbox', { name: 'Email' }`,
      }),
    ).toBe(
      `(By.XPATH, "//*[@role='textbox' or self::input or self::textarea][@id=//label[normalize-space(.)='Email']/@for or ancestor::label[normalize-space(.)='Email'] or @aria-label='Email' or @placeholder='Email']")`,
    )
  })
})
