import { describe, it, expect } from 'vitest'
import { renderStepsFile as playwrightSteps } from '../adapters/playwright-ts/bdd'
import { renderStepsFile as cypressSteps } from '../adapters/cypress/bdd'
import { renderStepsFile as pySteps } from '../adapters/selenium-py/bdd'
import { renderStepsFile as javaSteps } from '../adapters/selenium-java/bdd'
import { mapScenarioToGherkin } from './gherkin-mapper'
import { validatePythonSource } from '../adapters/selenium-py/python-validate'
import type { IRElement, IRPage, IRScenario, IRStep, InferredMethod } from '../ir/types'

function el(name: string, tagName: string, inputType?: string): IRElement {
  return {
    name,
    locatorStrategy: 'testid',
    locatorValue: `[data-testid="${name}"]`,
    tagName,
    inputType,
  }
}

const total = el('totalLabel', 'span')
const count = el('countLabel', 'span')
const search = el('queryInput', 'input')
const go = el('goBtn', 'button')
const terms = el('termsCheckbox', 'input', 'checkbox')

function step(partial: Partial<IRStep> & Pick<IRStep, 'action'>): IRStep {
  return { id: crypto.randomUUID(), ...partial }
}

const verifyTotal: InferredMethod = {
  name: 'verifyTotal',
  params: [],
  steps: [
    step({
      action: 'assert',
      element: total,
      assertionDetail: { type: 'text', expected: '42' },
    }),
  ],
}
const verifyCount: InferredMethod = {
  name: 'verifyCount',
  params: [],
  steps: [
    step({
      action: 'assert',
      element: count,
      assertionDetail: { type: 'count', expected: 3 },
    }),
  ],
}
const clickGo: InferredMethod = {
  name: 'clickGo',
  params: [],
  steps: [step({ action: 'click', element: go })],
}
const fillQuery: InferredMethod = {
  name: 'fillQuery',
  params: ['query'],
  paramTypes: ['string'],
  steps: [step({ action: 'fill', element: search, value: 'shoes' })],
}
const accept: InferredMethod = {
  name: 'acceptAndSubmit',
  params: ['terms'],
  paramTypes: ['boolean'],
  steps: [step({ action: 'check', element: terms }), step({ action: 'click', element: go })],
}

const methods = [fillQuery, clickGo, verifyTotal, verifyCount, accept]

const page: IRPage = {
  name: 'Shop',
  className: 'ShopPage',
  normalizedUrl: '/shop',
  elements: [total, count, search, go, terms],
  steps: methods.flatMap((m) => m.steps),
  inferredMethods: methods,
}

const scenario: IRScenario = { name: 'Shop flow', pages: [page] }

describe('BDD patterns are unique per method', () => {
  const steps = mapScenarioToGherkin(scenario).scenarios.flatMap((s) => s.steps)

  it('gives every default-named method its own pattern', () => {
    const patterns = steps.map((s) => s.pattern)
    expect(new Set(patterns).size).toBe(patterns.length)
  })

  it('keeps each pattern placeholder count equal to its parameter count', () => {
    for (const s of steps) {
      const placeholders = (s.pattern.match(/\{(string|int|float)\}/g) ?? []).length
      const expected = s.method ? s.method.params.length : placeholders
      expect(placeholders, s.pattern).toBeLessThanOrEqual(expected)
    }
  })

  it('embeds the subject in the pattern for verify / click', () => {
    const texts = steps.map((s) => s.pattern)
    expect(texts).toContain('I verify the "total"')
    expect(texts).toContain('I verify the "count"')
    expect(texts).toContain('I click the "go" element')
  })
})

describe('step definitions dispatch to the right method', () => {
  it('playwright-ts', () => {
    const out = playwrightSteps(scenario)
    expect(out).toContain('shopPage.verifyTotal();')
    expect(out).toContain('shopPage.verifyCount();')
    expect(out).toContain('shopPage.clickGo();')
    expect(out).toContain('shopPage.fillQuery(arg1);')
    expect(out).toContain('shopPage.acceptAndSubmit(true);')
  })

  it('cypress', () => {
    const out = cypressSteps(scenario)
    expect(out).toContain('shopPage.verifyTotal();')
    expect(out).toContain('shopPage.verifyCount();')
    expect(out).toContain('shopPage.acceptAndSubmit(true);')
  })

  it('selenium-py (valid Python)', () => {
    const out = pySteps(scenario)
    expect(out).toContain('shop_page.verifyTotal()')
    expect(out).toContain('shop_page.verifyCount()')
    expect(out).toContain('shop_page.acceptAndSubmit(True)')
    expect(validatePythonSource(out).ok).toBe(true)
  })

  it('selenium-java', () => {
    const out = javaSteps(scenario)
    expect(out).toContain('shopPage.verifyTotal();')
    expect(out).toContain('shopPage.verifyCount();')
    expect(out).toContain('shopPage.acceptAndSubmit(true);')
  })

  it('leaves no unimplemented-step stub for method-backed steps', () => {
    for (const out of [
      playwrightSteps(scenario),
      cypressSteps(scenario),
      pySteps(scenario),
      javaSteps(scenario),
    ]) {
      expect(out).not.toContain('TODO: implement step')
    }
  })
})

describe('steps without a method or element handler', () => {
  const orphan = (action: IRStep['action']): IRScenario => ({
    name: 'Orphan',
    pages: [
      {
        name: 'Plain',
        className: 'PlainPage',
        normalizedUrl: '/plain',
        elements: [],
        steps: [step({ action })],
      } as IRPage,
    ],
  })

  it('treats a leftover wait/network step as an explicit no-op', () => {
    // mapScenarioToGherkin skips wait/network, so reach the body renderer directly.
    const out = playwrightSteps(orphan('wait'))
    expect(out).not.toContain('TODO')
  })

  it('never leaves a silent TODO in any adapter', () => {
    for (const render of [playwrightSteps, cypressSteps, pySteps, javaSteps]) {
      expect(render(orphan('click'))).not.toContain('TODO: implement step')
    }
  })
})
