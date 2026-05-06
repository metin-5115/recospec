import { describe, it, expect } from 'vitest'
import { inferMethods } from './method-inferer'
import type { IRStep } from '../ir/types'

function fillStep(name: string, tagName = 'input'): IRStep {
  return {
    id: crypto.randomUUID(),
    action: 'fill',
    value: 'test',
    element: { name, locatorStrategy: 'testid', locatorValue: `[data-testid="${name}"]`, tagName },
  }
}

function clickStep(name: string, tagName = 'button'): IRStep {
  return {
    id: crypto.randomUUID(),
    action: 'click',
    element: { name, locatorStrategy: 'testid', locatorValue: `[data-testid="${name}"]`, tagName },
  }
}

function keypressStep(key: string): IRStep {
  return { id: crypto.randomUUID(), action: 'keypress', key }
}

function navStep(url: string): IRStep {
  return { id: crypto.randomUUID(), action: 'navigate', url }
}

describe('inferMethods', () => {
  it('Pattern 1 — fill+fill+click(submit) → login', () => {
    const steps: IRStep[] = [
      fillStep('emailInput'),
      fillStep('passwordInput'),
      clickStep('submitBtn'),
    ]
    const methods = inferMethods(steps)
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('login')
    expect(methods[0].params).toEqual(['email', 'password'])
    expect(methods[0].steps).toHaveLength(3)
  })

  it('Pattern 2 — multiple fills+click → submitForm', () => {
    const steps: IRStep[] = [
      fillStep('firstNameInput'),
      fillStep('lastNameInput'),
      fillStep('emailInput'),
      clickStep('saveBtn'),
    ]
    const methods = inferMethods(steps)
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('submitForm')
    expect(methods[0].params).toHaveLength(3)
  })

  it('Pattern 3 — click+navigate → openItem', () => {
    const steps: IRStep[] = [clickStep('productLink', 'a'), navStep('/products/42')]
    const methods = inferMethods(steps)
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('openItem')
    expect(methods[0].params).toHaveLength(1)
  })

  it('Pattern 4 — click(menu)+click → selectFromMenu', () => {
    const menuStep: IRStep = {
      id: crypto.randomUUID(),
      action: 'click',
      element: {
        name: 'navMenuToggle',
        locatorStrategy: 'testid',
        locatorValue: '[data-testid="nav-menu"]',
        tagName: 'button',
      },
    }
    const itemStep: IRStep = {
      id: crypto.randomUUID(),
      action: 'click',
      element: {
        name: 'settingsLink',
        locatorStrategy: 'testid',
        locatorValue: '[data-testid="settings"]',
        tagName: 'a',
      },
    }
    const methods = inferMethods([menuStep, itemStep])
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('selectFromMenu')
    expect(methods[0].params).toHaveLength(1)
  })

  it('Pattern 5 — fill+Enter → search', () => {
    const steps: IRStep[] = [fillStep('searchInput'), keypressStep('Enter')]
    const methods = inferMethods(steps)
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('search')
    expect(methods[0].params).toEqual(['search'])
  })
})
