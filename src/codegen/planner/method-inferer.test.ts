import { describe, it, expect } from 'vitest'
import { inferMethods } from './method-inferer'
import type { IRStep, IRElement } from '../ir/types'

function fillStep(name: string, tagName = 'input', inputType?: string): IRStep {
  return {
    id: crypto.randomUUID(),
    action: 'fill',
    value: 'test',
    element: {
      name,
      locatorStrategy: 'testid',
      locatorValue: `[data-testid="${name}"]`,
      tagName,
      inputType,
    },
  }
}

function clickStep(name: string, tagName = 'button', inputType?: string): IRStep {
  return {
    id: crypto.randomUUID(),
    action: 'click',
    element: {
      name,
      locatorStrategy: 'testid',
      locatorValue: `[data-testid="${name}"]`,
      tagName,
      inputType,
    },
  }
}

function keypressStep(key: string): IRStep {
  return { id: crypto.randomUUID(), action: 'keypress', key }
}

function navStep(url: string): IRStep {
  return { id: crypto.randomUUID(), action: 'navigate', url }
}

function networkStep(url: string, method = 'POST'): IRStep {
  return {
    id: crypto.randomUUID(),
    action: 'network',
    network: { url, method, status: 200 },
  }
}

function waitStep(): IRStep {
  return {
    id: crypto.randomUUID(),
    action: 'wait',
    wait: { reason: 'networkidle', timeoutMs: 10_000 },
  }
}

describe('inferMethods — existing patterns (regressions)', () => {
  it('Pattern 1 — fill+Enter → search', () => {
    const methods = inferMethods([fillStep('searchInput'), keypressStep('Enter')])
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('search')
    expect(methods[0].params).toEqual(['search'])
  })

  it('Pattern 3 — email+password+submit → login (password type triggers it)', () => {
    const steps: IRStep[] = [
      fillStep('emailInput', 'input', 'email'),
      fillStep('passwordInput', 'input', 'password'),
      clickStep('submitBtn'),
    ]
    const methods = inferMethods(steps)
    expect(methods[0].name).toBe('login')
    expect(methods[0].params).toEqual(['email', 'password'])
  })

  it('Pattern 9 — click+navigate → openItem', () => {
    const methods = inferMethods([clickStep('productLink', 'a'), navStep('/products/42')])
    expect(methods[0].name).toBe('openItem')
  })

  it('Pattern 8 — menu+click → selectFromMenu', () => {
    const menu: IRElement = {
      name: 'navMenuToggle',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="nav"]',
      tagName: 'button',
    }
    const item: IRElement = {
      name: 'settingsLink',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="settings"]',
      tagName: 'a',
    }
    const methods = inferMethods([
      { id: 's1', action: 'click', element: menu },
      { id: 's2', action: 'click', element: item },
    ])
    expect(methods[0].name).toBe('selectFromMenu')
  })
})

describe('inferMethods — v2 patterns', () => {
  it('Pattern 2 — fill(searchInput)+click(searchBtn) → search', () => {
    const methods = inferMethods([fillStep('searchInput'), clickStep('searchBtn')])
    expect(methods[0].name).toBe('search')
    expect(methods[0].params).toEqual(['search'])
  })

  it('Pattern 3b — registration context → register', () => {
    const methods = inferMethods([
      fillStep('emailInput', 'input', 'email'),
      fillStep('passwordInput', 'input', 'password'),
      clickStep('signUpBtn'),
    ])
    expect(methods[0].name).toBe('register')
  })

  it('Pattern 5 — N fills with no closing click → fillForm', () => {
    const methods = inferMethods([
      fillStep('firstNameInput'),
      fillStep('lastNameInput'),
      fillStep('phoneInput'),
    ])
    expect(methods[0].name).toBe('fillForm')
    expect(methods[0].params).toHaveLength(3)
  })

  it('Pattern 6 — checkbox + submit → acceptAndSubmit', () => {
    const methods = inferMethods([
      clickStep('termsCheckbox', 'input', 'checkbox'),
      clickStep('submitBtn'),
    ])
    expect(methods[0].name).toBe('acceptAndSubmit')
    expect(methods[0].paramTypes).toEqual(['boolean'])
  })

  it('Pattern 7 — menu + click + navigate → navigateFromMenu', () => {
    const methods = inferMethods([
      clickStep('mainNavToggle'),
      clickStep('settingsLink', 'a'),
      navStep('/settings'),
    ])
    expect(methods[0].name).toBe('navigateFromMenu')
  })

  it('Pattern 10 — click + click(submit) → confirmAction', () => {
    const methods = inferMethods([clickStep('deleteRowBtn'), clickStep('confirmBtn')])
    expect(methods[0].name).toBe('confirmAction')
  })
})

describe('inferMethods — parameter type inference', () => {
  it('infers number for type=number inputs', () => {
    const methods = inferMethods([
      fillStep('quantityInput', 'input', 'number'),
      clickStep('addBtn'),
    ])
    expect(methods[0].paramTypes?.[0]).toBe('number')
  })

  it('infers boolean for checkbox-only single click (default fallback)', () => {
    // Single click on checkbox (no submit after) falls through to default → click<Name>
    const methods = inferMethods([clickStep('rememberMeCheckbox', 'input', 'checkbox')])
    expect(methods[0].name).toBe('clickRememberMe')
  })

  it('default keeps string for text fields', () => {
    const methods = inferMethods([fillStep('searchInput'), keypressStep('Enter')])
    expect(methods[0].paramTypes).toEqual(['string'])
  })
})

describe('inferMethods — collision resolution', () => {
  it('appends numeric suffix to duplicate method names within a page', () => {
    // Two independent submitForm-shaped flows on the same page
    const methods = inferMethods([
      fillStep('firstNameInput'),
      fillStep('lastNameInput'),
      clickStep('saveBtn'),
      fillStep('addressInput'),
      fillStep('cityInput'),
      clickStep('saveAddressBtn'),
    ])
    const names = methods.map((m) => m.name)
    expect(names).toContain('submitForm')
    expect(names).toContain('submitForm2')
  })
})

describe('inferMethods — default naming', () => {
  it('names a single click step click<ElementName>', () => {
    const methods = inferMethods([clickStep('helpLink', 'a')])
    expect(methods[0].name).toBe('clickHelp')
  })

  it('names a single trailing fill fill<ElementName>', () => {
    const methods = inferMethods([clickStep('openModalBtn'), fillStep('noteInput')])
    // click+fill doesn't match any pattern; both fall to defaults
    expect(methods[0].name).toBe('clickOpenModal')
    expect(methods[1].name).toBe('fillNote')
  })

  it('names a non-Enter keypress press<Key>', () => {
    const methods = inferMethods([keypressStep('Tab')])
    expect(methods[0].name).toBe('pressTab')
  })
})

describe('inferMethods — secret parameter detection', () => {
  it('marks password param as secret in login pattern', () => {
    const methods = inferMethods([
      fillStep('emailInput', 'input', 'email'),
      fillStep('passwordInput', 'input', 'password'),
      clickStep('submitBtn'),
    ])
    expect(methods[0].name).toBe('login')
    expect(methods[0].paramSecret).toEqual([true, true])
  })

  it('marks single password fill as secret in default fillField pattern', () => {
    const methods = inferMethods([
      clickStep('openModalBtn'),
      fillStep('passwordInput', 'input', 'password'),
    ])
    expect(methods[1].name).toBe('fillPassword')
    expect(methods[1].paramSecret).toEqual([true])
  })

  it('does NOT mark plain text fields as secret', () => {
    const methods = inferMethods([
      fillStep('firstNameInput'),
      fillStep('lastNameInput'),
      fillStep('phoneInput'),
    ])
    expect(methods[0].paramSecret).toEqual([false, false, false])
  })

  it('marks api_key field by name as secret even without password type', () => {
    const methods = inferMethods([fillStep('apiKeyInput'), keypressStep('Enter')])
    expect(methods[0].paramSecret).toEqual([true])
  })
})

describe('inferMethods — keyboard-driven forms', () => {
  const email = () => fillStep('emailInput', 'input', 'email')
  const password = () => fillStep('passwordInput', 'input', 'password')

  it('a Tab between two fills does not break login detection (click submit)', () => {
    const methods = inferMethods([
      email(),
      keypressStep('Tab'),
      password(),
      clickStep('loginButton'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['login'])
    expect(methods[0].params).toEqual(['email', 'password'])
    expect(methods[0].paramSecret).toEqual([true, true])
  })

  it('keeps the Tab step inside the method body so replay is unchanged', () => {
    const methods = inferMethods([
      email(),
      keypressStep('Tab'),
      password(),
      clickStep('loginButton'),
    ])
    expect(methods[0].steps.map((s) => s.action)).toEqual(['fill', 'keypress', 'fill', 'click'])
  })

  it('fill, Tab, fill, Enter → login (not search on the password field)', () => {
    const methods = inferMethods([email(), keypressStep('Tab'), password(), keypressStep('Enter')])
    expect(methods.map((m) => m.name)).toEqual(['login'])
    expect(methods[0].params).toEqual(['email', 'password'])
    expect(methods[0].steps.map((s) => s.action)).toEqual(['fill', 'keypress', 'fill', 'keypress'])
  })

  it('fill, fill, Enter (no Tab) → login', () => {
    const methods = inferMethods([email(), password(), keypressStep('Enter')])
    expect(methods.map((m) => m.name)).toEqual(['login'])
  })

  it('registration context with Enter → register', () => {
    const methods = inferMethods([
      fillStep('signUpEmailInput', 'input', 'email'),
      keypressStep('Tab'),
      fillStep('signUpPasswordInput', 'input', 'password'),
      keypressStep('Enter'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['register'])
  })

  it('three fills with Tabs and a click → submitForm', () => {
    const methods = inferMethods([
      fillStep('firstNameInput'),
      keypressStep('Tab'),
      fillStep('lastNameInput'),
      keypressStep('Tab'),
      fillStep('phoneInput'),
      clickStep('saveBtn'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['submitForm'])
    expect(methods[0].params).toEqual(['firstName', 'lastName', 'phone'])
  })

  it('three fills with Tabs and Enter → submitForm', () => {
    const methods = inferMethods([
      fillStep('firstNameInput'),
      keypressStep('Tab'),
      fillStep('lastNameInput'),
      keypressStep('Tab'),
      fillStep('phoneInput'),
      keypressStep('Enter'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['submitForm'])
    expect(methods[0].steps).toHaveLength(6)
  })

  it('Tabs between fills with no terminator → fillForm', () => {
    const methods = inferMethods([
      fillStep('firstNameInput'),
      keypressStep('Tab'),
      fillStep('lastNameInput'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['fillForm'])
  })

  it('a Tab between the last fill and the submit click is absorbed', () => {
    const methods = inferMethods([
      email(),
      password(),
      keypressStep('Tab'),
      clickStep('loginButton'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['login'])
  })

  it('a lone Tab still yields pressTab', () => {
    expect(inferMethods([keypressStep('Tab')]).map((m) => m.name)).toEqual(['pressTab'])
  })

  it('a Tab after a lone fill with no following fill is not swallowed', () => {
    const methods = inferMethods([fillStep('noteInput'), keypressStep('Tab')])
    expect(methods.map((m) => m.name)).toEqual(['fillNote', 'pressTab'])
  })

  it('a Tab before a different action stays a separate pressTab', () => {
    const methods = inferMethods([
      keypressStep('Tab'),
      email(),
      password(),
      clickStep('loginButton'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['pressTab', 'login'])
  })

  it('lone non-sensitive fill + Enter still yields search', () => {
    const methods = inferMethods([fillStep('queryInput'), keypressStep('Enter')])
    expect(methods.map((m) => m.name)).toEqual(['search'])
  })

  it('search does not fire on a sensitive field', () => {
    const methods = inferMethods([password(), keypressStep('Enter')])
    expect(methods.map((m) => m.name)).toEqual(['fillPassword', 'pressEnter'])
    expect(methods[0].paramSecret).toEqual([true])
  })

  it('search does not fire when preceded by another fill in the same form', () => {
    const methods = inferMethods([
      fillStep('firstNameInput'),
      fillStep('queryInput'),
      keypressStep('Enter'),
    ])
    expect(methods.map((m) => m.name)).not.toContain('search')
    expect(methods.map((m) => m.name)).toEqual(['submitForm'])
  })

  it('search after an unrelated step is unaffected', () => {
    const methods = inferMethods([
      clickStep('openBtn'),
      fillStep('queryInput'),
      keypressStep('Enter'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['clickOpen', 'search'])
  })
})

describe('inferMethods — network steps', () => {
  it('threads network step into the preceding user method without spawning a new one', () => {
    const methods = inferMethods([
      fillStep('emailInput', 'input', 'email'),
      fillStep('passwordInput', 'input', 'password'),
      clickStep('submitBtn'),
      networkStep('https://api.example.com/login'),
    ])
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('login')
    expect(methods[0].steps.some((s) => s.action === 'network')).toBe(true)
  })

  it('attaches a leading network step to the first method', () => {
    const methods = inferMethods([
      networkStep('https://api.example.com/bootstrap'),
      clickStep('startBtn'),
    ])
    expect(methods).toHaveLength(1)
    expect(methods[0].steps.some((s) => s.action === 'network')).toBe(true)
  })
})

function elementStep(
  action: IRStep['action'],
  name: string,
  tagName: string,
  extra: Partial<IRStep> = {},
  inputType?: string,
): IRStep {
  return {
    id: crypto.randomUUID(),
    action,
    element: {
      name,
      locatorStrategy: 'testid',
      locatorValue: `[data-testid="${name}"]`,
      tagName,
      inputType,
    },
    ...extra,
  }
}

describe('inferMethods — select / check / hover / dblclick', () => {
  it('names a lone select step after the element and exposes the value as a param', () => {
    const methods = inferMethods([
      elementStep('select', 'countrySelect', 'select', { value: 'tr' }),
    ])
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('selectCountry')
    expect(methods[0].params).toEqual(['country'])
    expect(methods[0].paramTypes).toEqual(['string'])
  })

  it('names check and uncheck steps without parameters', () => {
    const methods = inferMethods([
      elementStep('check', 'termsCheckbox', 'input', {}, 'checkbox'),
      elementStep('uncheck', 'newsletterCheckbox', 'input', {}, 'checkbox'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['checkTerms', 'uncheckNewsletter'])
    expect(methods.every((m) => m.params.length === 0)).toBe(true)
  })

  it('names hover and dblclick steps', () => {
    const methods = inferMethods([
      elementStep('hover', 'accountMenu', 'div'),
      elementStep('dblclick', 'rowItem', 'tr'),
    ])
    expect(methods.map((m) => m.name)).toEqual(['hoverAccountMenu', 'doubleClickRowItem'])
  })

  it('Pattern 6 — check + submit → acceptAndSubmit with a boolean param', () => {
    const methods = inferMethods([
      elementStep('check', 'consentCheckbox', 'input', {}, 'checkbox'),
      clickStep('submitBtn'),
    ])
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('acceptAndSubmit')
    expect(methods[0].paramTypes).toEqual(['boolean'])
  })
})

describe('inferMethods — auto-detected waits', () => {
  it('attaches a wait to the method of the action it follows instead of inventing doAction', () => {
    const save = clickStep('save')
    const wait = waitStep()
    const methods = inferMethods([save, wait])
    expect(methods.map((m) => m.name)).toEqual(['clickSave'])
    expect(methods[0]!.steps).toEqual([save, wait])
  })

  it('creates no method for a wait that has no preceding action', () => {
    expect(inferMethods([waitStep()])).toEqual([])
  })

  it('keeps login intact when the recording ends with network and wait steps', () => {
    const steps = [
      fillStep('emailInput', 'input', 'email'),
      fillStep('passwordInput', 'input', 'password'),
      clickStep('signInButton'),
      networkStep('/api/login'),
      waitStep(),
    ]
    const methods = inferMethods(steps)
    expect(methods.map((m) => m.name)).toEqual(['login'])
    expect(methods[0]!.steps.map((s) => s.action)).toEqual([
      'fill',
      'fill',
      'click',
      'network',
      'wait',
    ])
  })

  it('still assigns each network step to the action that triggered it', () => {
    const open = clickStep('open')
    const netOpen = networkStep('/api/open')
    const filter = clickStep('filter')
    const netFilter = networkStep('/api/filter')
    const methods = inferMethods([open, netOpen, waitStep(), filter, netFilter, waitStep()])
    expect(methods.map((m) => m.name)).toEqual(['clickOpen', 'clickFilter'])
    expect(methods[0]!.steps).toContain(netOpen)
    expect(methods[0]!.steps).not.toContain(netFilter)
    expect(methods[1]!.steps).toContain(netFilter)
  })
})
