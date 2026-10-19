import { describe, it, expect } from 'vitest'
import { getAdapter } from './registry'
import './playwright-ts'
import './cypress'
import './selenium-py'
import './selenium-java'
import type { IRPage, IRScenario } from '../ir/types'
import type { FrameworkId } from '@shared/types/generated'

function scenarioWith(expected: string): IRScenario {
  const page: IRPage = {
    name: 'Orders',
    className: 'OrdersPage',
    normalizedUrl: '/orders',
    elements: [],
    steps: [
      { id: 's1', action: 'navigate', url: '/orders' },
      {
        id: 's2',
        action: 'assert',
        assertionDetail: { type: 'url', expected },
        pageUrl: '/orders',
      },
    ],
  }
  return { name: 'Orders flow', startUrl: 'https://shop.test/orders', pages: [page] }
}

function render(framework: FrameworkId, expected: string): string {
  const adapter = getAdapter(framework)
  const scenario = scenarioWith(expected)
  return [
    ...scenario.pages.map((p) => adapter.renderPageObject(p, {}).content),
    adapter.renderScenario(scenario, {}).content,
  ].join('\n')
}

describe('url assertions', () => {
  it('playwright asserts the page URL with a regex', () => {
    const out = render('playwright-ts', '/orders/:id')
    expect(out).toContain('await expect(page).toHaveURL(new RegExp("/orders/[^/]+(?:[?#]|$)"));')
  })

  it('cypress uses include for a route and match for a dynamic one', () => {
    expect(render('cypress', '/orders')).toContain(`cy.url().should('include', "/orders");`)
    expect(render('cypress', '/orders/:id')).toContain(
      `cy.url().should('match', new RegExp("/orders/[^/]+(?:[?#]|$)"));`,
    )
  })

  it('selenium python waits for the URL', () => {
    expect(render('selenium-py', '/orders')).toContain("EC.url_contains('/orders')")
    expect(render('selenium-py', '/orders/:id')).toContain(
      "EC.url_matches('/orders/[^/]+(?:[?#]|$)')",
    )
  })

  it('selenium java waits for the URL', () => {
    expect(render('selenium-java', '/orders')).toContain(
      'wait.until(ExpectedConditions.urlContains("/orders"));',
    )
    expect(render('selenium-java', '/orders/:id')).toContain(
      'wait.until(ExpectedConditions.urlMatches("/orders/[^/]+(?:[?#]|$)"));',
    )
  })
})
