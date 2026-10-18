import { describe, it, expect } from 'vitest'
import {
  renderFindByAnnotation,
  renderFallbackAnnotation,
  renderByExpression,
  renderFindByLocator,
  javaStr,
} from './locator'
import type { IRElement } from '../../ir/types'

describe('selenium-java renderFindByAnnotation', () => {
  it('emits @FindBy(css = ...) for testid strategy', () => {
    const el: IRElement = {
      name: 'emailInput',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="login-email"]',
      tagName: 'input',
    }
    expect(renderFindByAnnotation(el)).toBe(`@FindBy(css = "[data-testid=\\"login-email\\"]")`)
  })

  it('emits @FindBy(css = ...) for aria-label strategy', () => {
    const el: IRElement = {
      name: 'emailInput',
      locatorStrategy: 'aria-label',
      locatorValue: '[aria-label="Email"]',
      tagName: 'input',
    }
    expect(renderFindByAnnotation(el)).toBe(`@FindBy(css = "[aria-label=\\"Email\\"]")`)
  })

  it('emits @FindBy(xpath = ...) for role-name strategy with tagName', () => {
    const el: IRElement = {
      name: 'signInButton',
      locatorStrategy: 'role-name',
      locatorValue: `'button', { name: 'Sign In' }`,
      tagName: 'button',
    }
    expect(renderFindByAnnotation(el)).toBe(
      `@FindBy(xpath = "//button[normalize-space(.)='Sign In' or @value='Sign In' or @aria-label='Sign In']")`,
    )
  })

  it('emits @FindBy(xpath = ...) for text strategy', () => {
    const el: IRElement = {
      name: 'welcome',
      locatorStrategy: 'text',
      locatorValue: 'Welcome, QA Tester',
      tagName: 'div',
    }
    expect(renderFindByAnnotation(el)).toBe(
      `@FindBy(xpath = "//*[normalize-space()='Welcome, QA Tester']")`,
    )
  })

  it('emits @FindBy(id = ...) stripping leading hash', () => {
    const el: IRElement = {
      name: 'username',
      locatorStrategy: 'id',
      locatorValue: '#username',
      tagName: 'input',
    }
    expect(renderFindByAnnotation(el)).toBe(`@FindBy(id = "username")`)
  })

  it('emits @FindBy(xpath = ...) passthrough for xpath strategy', () => {
    const el: IRElement = {
      name: 'foo',
      locatorStrategy: 'xpath',
      locatorValue: "//div[@class='foo']",
      tagName: 'div',
    }
    expect(renderFindByAnnotation(el)).toBe(`@FindBy(xpath = "//div[@class='foo']")`)
  })

  it('falls back to @FindBy(css = ...) for css strategy', () => {
    const el: IRElement = {
      name: 'foo',
      locatorStrategy: 'css',
      locatorValue: '.foo > .bar',
      tagName: 'div',
    }
    expect(renderFindByAnnotation(el)).toBe(`@FindBy(css = ".foo > .bar")`)
  })

  it('uses XPath concat() literal for text containing both quote types', () => {
    const el: IRElement = {
      name: 'mixed',
      locatorStrategy: 'text',
      locatorValue: `O'Reilly says "hi"`,
      tagName: 'div',
    }
    const out = renderFindByAnnotation(el)
    expect(out.startsWith('@FindBy(xpath = ')).toBe(true)
    expect(out).toContain('concat(')
  })
})

describe('selenium-java renderFallbackAnnotation', () => {
  it('produces matching annotations for fallback strategies', () => {
    expect(
      renderFallbackAnnotation({ strategy: 'aria-label', locatorValue: '[aria-label="Email"]' }),
    ).toBe(`@FindBy(css = "[aria-label=\\"Email\\"]")`)

    expect(
      renderFallbackAnnotation({
        strategy: 'role-name',
        locatorValue: `'textbox', { name: 'Email' }`,
      }),
    ).toBe(
      `@FindBy(xpath = "//*[@role='textbox' or self::input or self::textarea][@id=//label[normalize-space(.)='Email']/@for or ancestor::label[normalize-space(.)='Email'] or @aria-label='Email' or @placeholder='Email']")`,
    )
  })
})

describe('selenium-java renderByExpression', () => {
  it('emits By.cssSelector for css strategies', () => {
    const el: IRElement = {
      name: 'emailInput',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="email"]',
      tagName: 'input',
    }
    expect(renderByExpression(el)).toBe(`By.cssSelector("[data-testid=\\"email\\"]")`)
  })

  it('emits By.xpath for role-name', () => {
    const el: IRElement = {
      name: 'signInButton',
      locatorStrategy: 'role-name',
      locatorValue: `'button', { name: 'Sign In' }`,
      tagName: 'button',
    }
    expect(renderByExpression(el)).toBe(
      `By.xpath("//button[normalize-space(.)='Sign In' or @value='Sign In' or @aria-label='Sign In']")`,
    )
  })

  it('emits By.id for id strategy', () => {
    const el: IRElement = {
      name: 'foo',
      locatorStrategy: 'id',
      locatorValue: '#foo',
      tagName: 'input',
    }
    expect(renderByExpression(el)).toBe(`By.id("foo")`)
  })
})

describe('selenium-java javaStr', () => {
  it('escapes embedded quotes', () => {
    expect(javaStr(`hello "world"`)).toBe(`"hello \\"world\\""`)
  })

  it('escapes backslashes', () => {
    expect(javaStr(`a\\b`)).toBe(`"a\\\\b"`)
  })

  it('escapes newlines', () => {
    expect(javaStr(`a\nb`)).toBe(`"a\\nb"`)
  })
})

describe('selenium-java renderFindByLocator type mapping', () => {
  it('maps testid to css', () => {
    expect(
      renderFindByLocator({ locatorStrategy: 'testid', locatorValue: '[data-testid="x"]' }).type,
    ).toBe('css')
  })
  it('maps role-name to xpath', () => {
    expect(
      renderFindByLocator({
        locatorStrategy: 'role-name',
        locatorValue: `'button', { name: 'Go' }`,
        tagName: 'button',
      }).type,
    ).toBe('xpath')
  })
})
