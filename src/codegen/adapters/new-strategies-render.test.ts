import { describe, it, expect } from 'vitest'
import type { IRElement } from '../ir/types'
import type { LayoutSpec } from '@shared/types/locator'
import { renderLocator as renderPlaywrightLocator } from './playwright-ts'
import { renderLocator as renderCypressLocator } from './cypress/locator'
import {
  renderLocatorTuple,
  renderRelativeLocator as renderPyRelative,
} from './selenium-py/locator'
import {
  renderFindByAnnotation,
  renderRelativeLocator as renderJavaRelative,
} from './selenium-java/locator'

/**
 * Faz 5 acceptance — every new strategy renders across the 4-framework matrix.
 * Attribute strategies (placeholder/alt/title/name/href) are CSS selectors that
 * every adapter handles; Playwright additionally emits idiomatic getBy*.
 * Layout (spatial) renders in Playwright + Selenium and emits an explicit
 * "unsupported" path in Cypress — never a silent drop.
 */

function el(
  partial: Partial<IRElement> & Pick<IRElement, 'locatorStrategy' | 'locatorValue'>,
): IRElement {
  return { name: 'target', tagName: 'input', ...partial }
}

describe('attribute strategies — 4-framework render', () => {
  it('placeholder', () => {
    const e = el({
      locatorStrategy: 'placeholder',
      locatorValue: '[placeholder="Search products…"]',
    })
    expect(renderPlaywrightLocator(e)).toBe('page.getByPlaceholder("Search products…")')
    expect(renderCypressLocator(e)).toBe('cy.get("[placeholder=\\"Search products…\\"]")')
    expect(renderLocatorTuple(e)).toContain('By.CSS_SELECTOR')
    expect(renderFindByAnnotation(e)).toContain('@FindBy(css = ')
  })

  it('alt', () => {
    const e = el({ locatorStrategy: 'alt', locatorValue: '[alt="Company logo"]', tagName: 'img' })
    expect(renderPlaywrightLocator(e)).toBe('page.getByAltText("Company logo")')
    expect(renderCypressLocator(e)).toContain('[alt=')
    expect(renderLocatorTuple(e)).toContain('By.CSS_SELECTOR')
    expect(renderFindByAnnotation(e)).toContain('@FindBy(css = ')
  })

  it('title', () => {
    const e = el({ locatorStrategy: 'title', locatorValue: '[title="Close"]' })
    expect(renderPlaywrightLocator(e)).toBe('page.getByTitle("Close")')
    expect(renderCypressLocator(e)).toContain('[title=')
  })

  it('name', () => {
    const e = el({ locatorStrategy: 'name', locatorValue: 'input[name="email"]' })
    expect(renderPlaywrightLocator(e)).toBe('page.locator("input[name=\\"email\\"]")')
    expect(renderCypressLocator(e)).toContain('input[name=')
    expect(renderLocatorTuple(e)).toContain('By.CSS_SELECTOR')
  })

  it('href', () => {
    const e = el({ locatorStrategy: 'href', locatorValue: 'a[href="/logout"]', tagName: 'a' })
    expect(renderPlaywrightLocator(e)).toBe('page.locator("a[href=\\"/logout\\"]")')
    expect(renderCypressLocator(e)).toContain('a[href=')
    expect(renderFindByAnnotation(e)).toContain('@FindBy(css = ')
  })
})

describe('layout strategy — spatial relation render', () => {
  const layout: LayoutSpec = {
    relation: 'right-of',
    target: { tag: 'input' },
    anchor: { role: 'text', name: 'Email', css: 'label.email' },
  }
  const e = el({ locatorStrategy: 'layout', locatorValue: 'input', layout })

  it('Playwright uses :right-of() with the anchor text', () => {
    expect(renderPlaywrightLocator(e)).toBe('page.locator("input:right-of(:text(\\"Email\\"))")')
  })

  it('Cypress emits an explicit unsupported comment (no silent drop)', () => {
    const code = renderCypressLocator(e)
    expect(code).toContain('layout locator unsupported in Cypress')
    expect(code).toContain('right-of')
  })

  it('Selenium Python uses locate_with().to_right_of()', () => {
    expect(renderPyRelative(e)).toBe(
      "locate_with(By.TAG_NAME, 'input').to_right_of({By.CSS_SELECTOR: 'label.email'})",
    )
  })

  it('Selenium Java uses RelativeLocator.with().toRightOf()', () => {
    expect(renderJavaRelative(e)).toBe(
      'RelativeLocator.with(By.tagName("input")).toRightOf(By.cssSelector("label.email"))',
    )
  })
})
