import { describe, it, expect } from 'vitest'
import type { IRElement } from '../ir/types'
import type { ComposedSpec } from '@shared/types/locator'
import { renderLocator as renderPlaywrightLocator } from './playwright-ts'
import { renderLocator as renderCypressLocator } from './cypress/locator'
import { renderLocatorTuple } from './selenium-py/locator'
import { renderFindByAnnotation } from './selenium-java/locator'

/**
 * Stage 4 — a container-anchored composed locator (row keyed by a stable label)
 * renders across the 4-framework matrix, and the dynamic value the user clicked
 * (the price) NEVER leaks into any generated selector.
 */

const PRICE = '76.800 TL'
const NAME = 'Acapulco Resort Convention Spa'

const containerSpec: ComposedSpec = {
  anchor: {
    kind: 'container',
    value: NAME,
    css: 'div.card',
    filterText: NAME,
  },
  target: { tag: 'p', css: 'p.price' },
  xpath: `//div[contains(concat(' ', normalize-space(@class), ' '), ' card ')][contains(normalize-space(.), '${NAME}')]//p[contains(concat(' ', normalize-space(@class), ' '), ' price ')]`,
}

const el: IRElement = {
  name: 'priceCell',
  locatorStrategy: 'composed',
  locatorValue: `div.card hasText="${NAME}" >> p.price`,
  tagName: 'p',
  composed: containerSpec,
}

describe('container anchor — 4-framework render', () => {
  it('Playwright filters the row by hasText then locates the target', () => {
    const code = renderPlaywrightLocator(el)
    expect(code).toBe(
      'page.locator("div.card").filter({ hasText: "Acapulco Resort Convention Spa" }).locator("p.price")',
    )
  })

  it('Cypress filters the row via :contains', () => {
    const code = renderCypressLocator(el)
    expect(code).toContain('cy.get("div.card")')
    expect(code).toContain('.filter(')
    expect(code).toContain('Acapulco Resort Convention Spa')
  })

  it('Selenium Python uses the baked container xpath', () => {
    const tuple = renderLocatorTuple(el)
    expect(tuple).toContain('By.XPATH')
    expect(tuple).toContain('contains(normalize-space(.)')
  })

  it('Selenium Java uses the baked container xpath', () => {
    const ann = renderFindByAnnotation(el)
    expect(ann).toContain('@FindBy(xpath = ')
    expect(ann).toContain('contains(normalize-space(.)')
  })

  it('the dynamic price never leaks into any rendered output', () => {
    const outputs = [
      renderPlaywrightLocator(el),
      renderCypressLocator(el),
      renderLocatorTuple(el),
      renderFindByAnnotation(el),
    ]
    for (const out of outputs) expect(out).not.toContain(PRICE)
  })
})

describe('container anchor — positional (FRAGILE) render', () => {
  const nthEl: IRElement = {
    name: 'cell',
    locatorStrategy: 'composed',
    locatorValue: 'div.row nth=2 >> p.v',
    tagName: 'p',
    composed: {
      anchor: { kind: 'container', value: 'div.row', css: 'div.row', nthIndex: 2 },
      target: { tag: 'p', css: 'p.v' },
      xpath: `(//div[contains(concat(' ', normalize-space(@class), ' '), ' row ')])[3]//p[contains(concat(' ', normalize-space(@class), ' '), ' v ')]`,
    },
  }

  it('Playwright renders .nth(2) on the scope', () => {
    expect(renderPlaywrightLocator(nthEl)).toContain('.nth(2).locator("p.v")')
  })

  it('Cypress renders .eq(2) on the scope', () => {
    expect(renderCypressLocator(nthEl)).toContain('.eq(2)')
  })
})
