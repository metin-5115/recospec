import { describe, it, expect } from 'vitest'
import * as playwright from '../adapters/playwright-ts/bdd'
import * as cypress from '../adapters/cypress/bdd'
import {
  renderFeatureFile as pyFeature,
  renderStepsFile as pySteps,
} from '../adapters/selenium-py/bdd'
import {
  renderFeatureFile as javaFeature,
  renderStepsFile as javaSteps,
} from '../adapters/selenium-java/bdd'
import type { IRPage, IRScenario } from '../ir/types'

function scenarioEndingOn(expected: string): IRScenario {
  const page: IRPage = {
    name: 'Orders',
    className: 'OrdersPage',
    normalizedUrl: '/orders',
    elements: [],
    steps: [
      { id: 's0', action: 'navigate', url: '/orders' },
      {
        id: 's1',
        action: 'assert',
        assertionDetail: { type: 'url', expected },
        pageUrl: '/orders',
      },
    ],
  }
  return { name: 'Orders flow', pages: [page] }
}

describe('final-state URL assertion in BDD output', () => {
  it('is a readable Gherkin step that keeps only the static part of a dynamic route', () => {
    expect(playwright.renderFeatureFile(scenarioEndingOn('/orders/:id'))).toContain(
      'the page URL should contain "/orders/"',
    )
  })

  it('checks the URL in every framework instead of a visibility check', () => {
    const scenario = scenarioEndingOn('/orders')
    expect(playwright.renderStepsFile(scenario)).toContain('toHaveURL(')
    expect(cypress.renderStepsFile(scenario)).toContain("cy.url().should('include', arg1)")
    expect(pySteps(scenario)).toContain('current_url')
    expect(javaSteps(scenario)).toContain('getCurrentUrl()')
    for (const text of [
      playwright.renderStepsFile(scenario),
      cypress.renderStepsFile(scenario),
      pySteps(scenario),
      javaSteps(scenario),
    ]) {
      expect(text).not.toContain('be.visible')
      expect(text).not.toContain('isDisplayed')
      expect(text).not.toContain('toBeVisible')
    }
    expect(pyFeature(scenario)).toContain('the page URL should contain "/orders"')
    expect(javaFeature(scenario)).toContain('the page URL should contain "/orders"')
  })
})
