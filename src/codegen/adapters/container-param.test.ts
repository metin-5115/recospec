import { describe, it, expect } from 'vitest'
import type { IRPage, IRStep, IRElement } from '../ir/types'
import type { ComposedSpec } from '@shared/types/locator'
import { renderPageObject as renderPlaywrightPage } from './playwright-ts'
import { inferMethods } from '../planner/method-inferer'

/**
 * Stage 6 — a container-anchored row can be rendered either scoped (default,
 * hardcoded label) or as a parameterized page-object method.
 */

const NAME = 'Acapulco Resort Convention Spa'

function spec(): ComposedSpec {
  return {
    anchor: { kind: 'container', value: NAME, css: 'div.card', filterText: NAME },
    target: { tag: 'p', css: 'p.price' },
    xpath: `//div[contains(concat(' ', normalize-space(@class), ' '), ' card ')][contains(normalize-space(.), '${NAME}')]//p`,
  }
}

function priceEl(mode?: 'scoped' | 'param'): IRElement {
  return {
    name: 'priceCell',
    locatorStrategy: 'composed',
    locatorValue: `div.card hasText="${NAME}" >> p.price`,
    tagName: 'p',
    composed: spec(),
    composedParamMode: mode,
  }
}

function pageWith(el: IRElement): IRPage {
  const steps: IRStep[] = [
    { id: 's1', action: 'navigate', url: 'https://shop.test/list' },
    { id: 's2', action: 'click', element: el },
  ]
  return {
    name: 'List',
    className: 'ListPage',
    normalizedUrl: 'https://shop.test/list',
    steps,
    elements: [el],
    inferredMethods: inferMethods(steps),
  }
}

describe('container param mode — Playwright', () => {
  it('scoped (default) hardcodes the label as a getter', () => {
    const code = renderPlaywrightPage(pageWith(priceEl()))
    expect(code).toContain('get priceCell()')
    expect(code).toContain(`.filter({ hasText: "${NAME}" })`)
  })

  it('param mode renders a parameterized accessor + select method (no hardcoded label in the method body)', () => {
    const code = renderPlaywrightPage(pageWith(priceEl('param')))
    expect(code).toContain('priceCell(name: string) {')
    expect(code).toContain('.filter({ hasText: name })')
    expect(code).toContain('async selectPriceCell(name: string) {')
    expect(code).toContain('await this.priceCell(name).click();')
  })

  it('method inference produces a name-parameterized select for a param click', () => {
    const methods = inferMethods([{ id: 's2', action: 'click', element: priceEl('param') }])
    expect(methods[0].name).toBe('selectPriceCell')
    expect(methods[0].params).toEqual(['name'])
  })

  it('scoped click stays parameterless', () => {
    const methods = inferMethods([{ id: 's2', action: 'click', element: priceEl('scoped') }])
    expect(methods[0].params).toEqual([])
  })
})
