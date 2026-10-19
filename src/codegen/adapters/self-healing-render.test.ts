import { describe, it, expect } from 'vitest'
import { renderPageObject as playwrightPage } from './playwright-ts/page-object'
import { renderScenario as playwrightScenario } from './playwright-ts/scenario'
import { renderPageObject as cypressPage } from './cypress/page-object'
import { renderScenario as cypressScenario } from './cypress/scenario'
import type { IRElement, IRPage, IRScenario } from '../ir/types'

const email: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: 'email',
  tagName: 'input',
  fallbackLocators: [
    { strategy: 'aria-label', locatorValue: '[aria-label="Email"]' },
    { strategy: 'css', locatorValue: 'form > input.email' },
    { strategy: 'role-name', locatorValue: 'textbox[name="Email"]' },
  ],
}

const plain: IRElement = {
  name: 'saveBtn',
  locatorStrategy: 'testid',
  locatorValue: 'save',
  tagName: 'button',
}

const page: IRPage = {
  name: 'Profile',
  className: 'ProfilePage',
  normalizedUrl: '/profile',
  elements: [email, plain],
  steps: [
    { id: 's0', action: 'navigate', url: '/profile' },
    { id: 's1', action: 'fill', element: email, value: 'a@b.co' },
    { id: 's2', action: 'click', element: plain },
  ],
}

const scenario: IRScenario = { name: 'Profile flow', pages: [page] }

describe('Playwright runtime self-healing', () => {
  it('gives an element with fallbacks a getter that tries them at run time', () => {
    const out = playwrightPage(page, { selfHealing: true })
    expect(out).toContain(
      'get emailInput() { return selfHealingLocator(this.page, [this.page.getByTestId("email"), this.page.getByLabel("Email"), this.page.locator("form > input.email"), this.page.getByRole("textbox", { name: "Email" })]); }',
    )
    expect(out).toContain("import { selfHealingLocator } from '../utils/locator';")
  })

  it('leaves an element without fallbacks, and the whole page when the option is off', () => {
    const on = playwrightPage(page, { selfHealing: true })
    expect(on).toContain('get saveBtn() { return this.page.getByTestId("save"); }')
    const off = playwrightPage(page)
    expect(off).not.toContain('selfHealingLocator')
    expect(off).toContain('get emailInput() { return this.page.getByTestId("email"); }')
  })

  it('keeps the fallback comment for the reader', () => {
    expect(playwrightPage(page, { selfHealing: true })).toContain('// Fallbacks:')
  })

  it('imports the helper from where the configured folders put it', () => {
    const out = playwrightPage(page, { selfHealing: true, dirs: { pagesDir: 'src/e2e/pages' } })
    expect(out).toContain("from '../../../utils/locator'")
  })

  it('heals steps written inline in the spec as well', () => {
    const inline: IRPage = { ...page, inferredMethods: undefined }
    const out = playwrightScenario({ ...scenario, pages: [inline] }, { selfHealing: true })
    expect(out).toContain('await selfHealingLocator(page, [page.getByTestId("email")')
    expect(out).toContain("import { selfHealingLocator } from '../utils/locator';")
    expect(playwrightScenario({ ...scenario, pages: [inline] })).not.toContain('selfHealingLocator')
  })
})

describe('Cypress runtime self-healing', () => {
  it('routes the CSS-expressible locators through cy.selfHealing', () => {
    const out = cypressPage(page, { selfHealing: true })
    expect(out).toContain(
      `emailInput() { return cy.selfHealing(["[data-testid=\\"email\\"]","[aria-label=\\"Email\\"]","form > input.email"]); }`,
    )
    expect(out).toContain('saveBtn() { return cy.get("[data-testid=\\"save\\"]"); }')
  })

  it('does nothing when the option is off', () => {
    expect(cypressPage(page)).not.toContain('selfHealing')
  })

  it('heals inline spec steps too', () => {
    const inline: IRPage = { ...page, inferredMethods: undefined }
    const out = cypressScenario({ ...scenario, pages: [inline] }, { selfHealing: true })
    expect(out).toContain('cy.selfHealing([')
  })

  it('keeps the plain locator when the primary or every fallback needs a testing-library query', () => {
    const roleOnly: IRElement = {
      ...email,
      name: 'roleInput',
      locatorStrategy: 'role-name',
      locatorValue: 'textbox[name="Email"]',
    }
    const out = cypressPage({ ...page, elements: [roleOnly] }, { selfHealing: true })
    expect(out).not.toContain('cy.selfHealing(')
  })
})
