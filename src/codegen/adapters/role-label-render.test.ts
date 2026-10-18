import { describe, it, expect } from 'vitest'
import type { IRElement } from '../ir/types'
import { renderLocator as renderPlaywright } from './playwright-ts/locator'
import { renderLocator as renderCypress } from './cypress/locator'
import { renderLocatorTuple } from './selenium-py/locator'
import { renderFindByAnnotation } from './selenium-java/locator'

const roleName: IRElement = {
  name: 'applyButton',
  locatorStrategy: 'role-name',
  locatorValue: 'button[name="Apply"]',
  tagName: 'button',
}

const label: IRElement = {
  name: 'promoCodeInput',
  locatorStrategy: 'label',
  locatorValue: 'Promo code',
  tagName: 'input',
}

const inShadow = (el: IRElement): IRElement => ({
  ...el,
  shadowContext: { hostChain: ['promo-widget'] },
})

describe('role-name and label locators from the engine format', () => {
  it('Playwright queries by role and label', () => {
    expect(renderPlaywright(roleName)).toBe('page.getByRole("button", { name: "Apply" })')
    expect(renderPlaywright(label)).toBe('page.getByLabel("Promo code")')
  })

  it('Playwright keeps role and label queries inside a shadow host', () => {
    expect(renderPlaywright(inShadow(roleName))).toBe(
      'page.locator("promo-widget").getByRole("button", { name: "Apply" })',
    )
    expect(renderPlaywright(inShadow(label))).toBe(
      'page.locator("promo-widget").getByLabel("Promo code")',
    )
  })

  it('Cypress uses testing-library queries, also inside a shadow root', () => {
    expect(renderCypress(roleName)).toBe('cy.findByRole("button", { name: "Apply" })')
    expect(renderCypress(label)).toBe('cy.findByLabelText("Promo code")')
    expect(renderCypress(inShadow(roleName))).toBe(
      'cy.get("promo-widget").shadow().findByRole("button", { name: "Apply" })',
    )
  })

  it('Selenium targets the labelled control instead of the first input', () => {
    expect(renderLocatorTuple(label)).toBe(
      `(By.XPATH, "//input[@id=//label[normalize-space(.)='Promo code']/@for or ancestor::label[normalize-space(.)='Promo code']]")`,
    )
    expect(renderFindByAnnotation(roleName)).toBe(
      `@FindBy(xpath = "//button[normalize-space(.)='Apply' or @value='Apply' or @aria-label='Apply']")`,
    )
  })

  it('falls back to a raw locator for an unparseable role-name value', () => {
    const odd: IRElement = { ...roleName, locatorValue: 'div > span' }
    expect(renderPlaywright(odd)).toBe('page.locator("div > span")')
    expect(renderCypress(odd)).toBe('cy.get("div > span")')
  })
})
