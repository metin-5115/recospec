import { describe, it, expect } from 'vitest'
import {
  absoluteUrl,
  buildScenarioFlow,
  initialUrl,
  recordedOrigin,
  routeWithin,
} from './scenario-flow'
import { groupIntoPages } from '../planner/page-grouper'
import type { IRElement, IRScenario, IRStep } from '../ir/types'

function el(name: string, extra: Partial<IRElement> = {}): IRElement {
  return {
    name,
    locatorStrategy: 'testid',
    locatorValue: name,
    tagName: 'input',
    ...extra,
  }
}

function step(id: string, action: IRStep['action'], extra: Partial<IRStep> = {}): IRStep {
  return { id, action, ...extra }
}

function scenarioOf(steps: IRStep[], startUrl = 'http://localhost:4500/shop'): IRScenario {
  return { name: 'Flow', startUrl, pages: groupIntoPages(steps, startUrl) }
}

describe('buildScenarioFlow', () => {
  it('turns each inferred method into a call carrying the recorded values', () => {
    const scenario = scenarioOf([
      step('1', 'fill', { element: el('promoCodeInput'), value: 'SAVE10' }),
      step('2', 'click', { element: el('applyButton', { tagName: 'button' }) }),
    ])
    const flow = buildScenarioFlow(scenario)
    expect(flow).toHaveLength(1)
    const [call] = flow
    expect(call?.kind).toBe('call')
    if (call?.kind !== 'call') return
    expect(call.method.name).toBe('submitForm')
    expect(call.args).toEqual([
      expect.objectContaining({ type: 'string', value: 'SAVE10', fromFill: true }),
    ])
  })

  it('passes a boolean for check/uncheck parameters and a number for number inputs', () => {
    const scenario = scenarioOf([
      step('1', 'fill', { element: el('quantityInput', { inputType: 'number' }), value: '3' }),
      step('2', 'click', { element: el('addButton', { tagName: 'button' }) }),
      step('3', 'check', { element: el('giftWrapCheckbox', { inputType: 'checkbox' }) }),
    ])
    const calls = buildScenarioFlow(scenario).flatMap((i) => (i.kind === 'call' ? [i] : []))
    const [form, check] = calls
    expect(form?.args[0]).toMatchObject({ type: 'number', value: '3' })
    expect(check?.args).toEqual([]) // checkGiftWrap has no parameter: the toggle is its own method
  })

  it('keeps steps in recorded order and keeps a lone navigate between methods', () => {
    const scenario = scenarioOf([
      step('1', 'click', { element: el('aButton', { tagName: 'button' }) }),
      step('2', 'navigate', { url: 'http://localhost:4500/other' }),
      step('3', 'click', { element: el('bButton', { tagName: 'button' }) }),
    ])
    expect(buildScenarioFlow(scenario).map((i) => i.kind)).toEqual(['call', 'visit', 'call'])
  })

  it('renders pages without inferred methods inline', () => {
    const scenario: IRScenario = {
      name: 'Hand built',
      pages: [
        {
          name: 'Login',
          className: 'LoginPage',
          normalizedUrl: '/login',
          elements: [],
          steps: [step('1', 'click', { element: el('goButton') })],
        },
      ],
    }
    expect(buildScenarioFlow(scenario).map((i) => i.kind)).toEqual(['inline'])
  })
})

describe('absoluteUrl', () => {
  it('completes a route with the recorded origin', () => {
    expect(absoluteUrl('http://localhost:4500', '/cart')).toBe('http://localhost:4500/cart')
  })

  it('leaves a full URL or a route without a known origin alone', () => {
    expect(absoluteUrl('http://localhost:4500', 'https://other.test/x')).toBe(
      'https://other.test/x',
    )
    expect(absoluteUrl(undefined, '/cart')).toBe('/cart')
  })

  it('visits carry the completed URL', () => {
    const scenario = scenarioOf([
      step('1', 'click', { element: el('aButton', { tagName: 'button' }) }),
      step('2', 'navigate', { url: '/cart' }),
      step('3', 'click', { element: el('bButton', { tagName: 'button' }) }),
    ])
    const visit = buildScenarioFlow(scenario).find((i) => i.kind === 'visit')
    expect(visit).toMatchObject({ url: 'http://localhost:4500/cart' })
  })
})

describe('initialUrl', () => {
  it('is the recorded start URL', () => {
    const scenario = scenarioOf([step('1', 'click', { element: el('aButton') })])
    expect(initialUrl(scenario, buildScenarioFlow(scenario))).toBe('http://localhost:4500/shop')
  })

  it('is absent when the flow already opens with its own navigation', () => {
    const scenario = scenarioOf([
      step('1', 'navigate', { url: 'http://localhost:4500/shop' }),
      step('2', 'click', { element: el('aButton', { tagName: 'button' }) }),
    ])
    expect(initialUrl(scenario, buildScenarioFlow(scenario))).toBeUndefined()
  })

  it('is absent for about:blank or a missing start URL', () => {
    const blank = scenarioOf([step('1', 'click', { element: el('aButton') })], 'about:blank')
    expect(initialUrl(blank, buildScenarioFlow(blank))).toBeUndefined()
    const none: IRScenario = { ...blank, startUrl: undefined }
    expect(initialUrl(none, buildScenarioFlow(none))).toBeUndefined()
  })
})

describe('recordedOrigin', () => {
  it('is the origin of the page the recording started on', () => {
    expect(recordedOrigin(scenarioOf([], 'https://shop.example.com:8443/login?next=%2F'))).toBe(
      'https://shop.example.com:8443',
    )
  })

  it('falls back to the first page that has an http(s) origin', () => {
    const scenario: IRScenario = {
      name: 'Flow',
      startUrl: 'about:blank',
      pages: [
        {
          name: 'A',
          className: 'APage',
          normalizedUrl: '/',
          baseUrl: 'http://a.test',
          steps: [],
          elements: [],
        },
      ],
    }
    expect(recordedOrigin(scenario)).toBe('http://a.test')
  })

  it('is undefined for a recording with no http(s) page', () => {
    expect(recordedOrigin(scenarioOf([], 'file:///tmp/index.html'))).toBeUndefined()
  })
})

describe('routeWithin', () => {
  const base = 'https://shop.example.com'

  it.each([
    ['https://shop.example.com/login', '/login'],
    ['https://shop.example.com/search?q=a#top', '/search?q=a#top'],
    ['https://shop.example.com', '/'],
    ['https://shop.example.com?x=1', '/?x=1'],
    ['/cart', '/cart'],
  ])('turns %s into %s', (url, expected) => {
    expect(routeWithin(base, url)).toBe(expected)
  })

  it('keeps a URL on another origin absolute', () => {
    expect(routeWithin(base, 'https://pay.example.com/checkout')).toBe(
      'https://pay.example.com/checkout',
    )
  })

  it('does not mistake a longer host for the same origin', () => {
    expect(routeWithin(base, 'https://shop.example.com.evil.test/x')).toBe(
      'https://shop.example.com.evil.test/x',
    )
  })

  it('leaves the URL alone without a base', () => {
    expect(routeWithin(undefined, 'https://shop.example.com/login')).toBe(
      'https://shop.example.com/login',
    )
  })
})
