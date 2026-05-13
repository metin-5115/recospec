import { describe, it, expect } from 'vitest'
import { renderFeatureFile as renderPlaywrightFeature } from '../adapters/playwright-ts/bdd'
import { renderFeatureFile as renderCypressFeature } from '../adapters/cypress/bdd'
import { renderFeatureFile as renderSeleniumPyFeature } from '../adapters/selenium-py/bdd'
import { renderFeatureFile as renderSeleniumJavaFeature } from '../adapters/selenium-java/bdd'
import type { IRElement, IRPage, IRScenario } from '../ir/types'

// The four BDD adapters each ship their own `renderFeatureFile`, but the
// Gherkin output is meant to be framework-agnostic: same IR → identical
// `.feature` content. Only the step-definition files differ (Java vs JS vs
// Python vs TS). This invariant is the contract that lets teams switch
// frameworks without rewriting their feature suite.

const emailEl: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="email"]',
  tagName: 'input',
  inputType: 'email',
}
const passwordEl: IRElement = {
  name: 'passwordInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="password"]',
  tagName: 'input',
  inputType: 'password',
}
const submitEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="submit"]',
  tagName: 'button',
}
const searchEl: IRElement = {
  name: 'searchInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="search"]',
  tagName: 'input',
  inputType: 'search',
}
const itemListEl: IRElement = {
  name: 'itemList',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="items"]',
  tagName: 'ul',
}

const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [emailEl, passwordEl, submitEl],
  steps: [
    { id: 's0', action: 'navigate', url: '/login' },
    { id: 's1', action: 'fill', element: emailEl, value: 'admin@example.com' },
    { id: 's2', action: 'fill', element: passwordEl, value: 'secret' },
    { id: 's3', action: 'click', element: submitEl },
  ],
  inferredMethods: [
    {
      name: 'login',
      params: ['email', 'password'],
      paramTypes: ['string', 'string'],
      steps: [
        { id: 's1', action: 'fill', element: emailEl, value: 'admin@example.com' },
        { id: 's2', action: 'fill', element: passwordEl, value: 'secret' },
        { id: 's3', action: 'click', element: submitEl },
      ],
    },
  ],
}

const searchPage: IRPage = {
  name: 'Search',
  className: 'SearchPage',
  normalizedUrl: '/search',
  elements: [searchEl, itemListEl],
  steps: [
    { id: 'n', action: 'navigate', url: '/search' },
    { id: 'f', action: 'fill', element: searchEl, value: 'widgets' },
    {
      id: 'a',
      action: 'assert',
      element: itemListEl,
      assertionDetail: { type: 'count', expected: 3 },
    },
  ],
  inferredMethods: [
    {
      name: 'search',
      params: ['query'],
      paramTypes: ['string'],
      steps: [{ id: 'f', action: 'fill', element: searchEl, value: 'widgets' }],
    },
  ],
}

const scenarios: Array<{ label: string; scenario: IRScenario }> = [
  {
    label: 'single-page login flow',
    scenario: { name: 'User can log in', pages: [loginPage] },
  },
  {
    label: 'multi-page login + search flow',
    scenario: { name: 'User can search after logging in', pages: [loginPage, searchPage] },
  },
  {
    label: 'no-method page (step-level mapping)',
    scenario: {
      name: 'Standalone navigation',
      pages: [
        {
          name: 'Inventory',
          className: 'InventoryPage',
          normalizedUrl: '/inventory',
          elements: [itemListEl],
          steps: [
            { id: 'n', action: 'navigate', url: '/inventory' },
            {
              id: 'a',
              action: 'assert',
              element: itemListEl,
              assertionDetail: { type: 'count', expected: 5 },
            },
          ],
        },
      ],
    },
  },
]

describe('cross-adapter .feature invariant', () => {
  for (const { label, scenario } of scenarios) {
    it(`produces identical .feature content across all 4 frameworks — ${label}`, () => {
      const playwright = renderPlaywrightFeature(scenario)
      const cypress = renderCypressFeature(scenario)
      const seleniumPy = renderSeleniumPyFeature(scenario)
      const seleniumJava = renderSeleniumJavaFeature(scenario)

      expect(cypress).toBe(playwright)
      expect(seleniumPy).toBe(playwright)
      expect(seleniumJava).toBe(playwright)
    })
  }

  it('feature content is non-empty and Gherkin-shaped', () => {
    // Sanity: a contentless invariant is trivially "identical" — make sure
    // the four adapters are actually producing real output.
    const content = renderPlaywrightFeature(scenarios[0].scenario)
    expect(content).toMatch(/^Feature: /)
    expect(content).toMatch(/\n {2}Scenario: /)
    expect(content.length).toBeGreaterThan(50)
  })
})
