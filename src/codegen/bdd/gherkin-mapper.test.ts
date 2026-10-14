import { describe, it, expect } from 'vitest'
import {
  mapIRStepToGherkin,
  mapInferredMethodToGherkin,
  mapScenarioToGherkin,
} from './gherkin-mapper'
import type { IRElement, IRPage, IRScenario, IRStep, InferredMethod } from '../ir/types'

const buttonEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="submit"]',
  tagName: 'button',
}

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

const checkboxEl: IRElement = {
  name: 'termsCheckbox',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="terms"]',
  tagName: 'input',
  inputType: 'checkbox',
}

function ir(step: Partial<IRStep> & Pick<IRStep, 'action'>): IRStep {
  return { id: 'sx', ...step }
}

describe('mapIRStepToGherkin', () => {
  it('navigate → Given I am on the page', () => {
    const out = mapIRStepToGherkin(ir({ action: 'navigate', url: '/login' }), 'Given')
    expect(out.keyword).toBe('Given')
    expect(out.text).toBe('I am on the page "/login"')
    expect(out.pattern).toBe('I am on the page {string}')
    expect(out.params).toEqual(['/login'])
  })

  it('click button → When I click the "<label>" button', () => {
    const out = mapIRStepToGherkin(ir({ action: 'click', element: buttonEl }), 'When')
    expect(out.keyword).toBe('When')
    expect(out.text).toBe('I click the "submit" button')
    expect(out.pattern).toBe('I click the {string} button')
  })

  it('click link → labelled as link (anchor tag)', () => {
    const link: IRElement = { ...buttonEl, name: 'aboutLink', tagName: 'a' }
    const out = mapIRStepToGherkin(ir({ action: 'click', element: link }), 'When')
    expect(out.text).toBe('I click the "about" link')
    expect(out.pattern).toBe('I click the {string} link')
  })

  it('click checkbox → labelled as checkbox', () => {
    const out = mapIRStepToGherkin(ir({ action: 'click', element: checkboxEl }), 'When')
    expect(out.text).toContain('checkbox')
    expect(out.pattern).toBe('I click the {string} checkbox')
  })

  it('fill input → When I fill the field with value', () => {
    const out = mapIRStepToGherkin(
      ir({ action: 'fill', element: emailEl, value: 'admin@example.com' }),
      'When',
    )
    expect(out.text).toBe('I fill the "email" field with "admin@example.com"')
    expect(out.pattern).toBe('I fill the {string} field with {string}')
    expect(out.params).toEqual(['email', 'admin@example.com'])
  })

  it('keypress → When I press {string}', () => {
    const out = mapIRStepToGherkin(ir({ action: 'keypress', key: 'Enter' }), 'When')
    expect(out.text).toBe('I press "Enter"')
    expect(out.pattern).toBe('I press {string}')
  })

  it('assert visible → Then the subject should be visible', () => {
    const out = mapIRStepToGherkin(
      ir({ action: 'assert', element: buttonEl, assertionDetail: { type: 'visible' } }),
      'Then',
    )
    expect(out.keyword).toBe('Then')
    expect(out.text).toBe('the "submit" button should be visible')
  })

  it('assert text → Then the subject should have text (exact)', () => {
    const out = mapIRStepToGherkin(
      ir({
        action: 'assert',
        element: buttonEl,
        assertionDetail: { type: 'text', expected: 'Welcome' },
      }),
      'Then',
    )
    expect(out.text).toBe('the "submit" button should have text "Welcome"')
    expect(out.pattern).toBe('the {string} button should have text {string}')
  })

  it('assert text-contains → Then the subject should contain (partial)', () => {
    const out = mapIRStepToGherkin(
      ir({
        action: 'assert',
        element: buttonEl,
        assertionDetail: { type: 'text-contains', expected: 'Welcome' },
      }),
      'Then',
    )
    expect(out.text).toBe('the "submit" button should contain "Welcome"')
    expect(out.pattern).toBe('the {string} button should contain {string}')
  })

  it('assert count → integer placeholder', () => {
    const out = mapIRStepToGherkin(
      ir({
        action: 'assert',
        element: buttonEl,
        assertionDetail: { type: 'count', expected: 3 },
      }),
      'Then',
    )
    expect(out.text).toBe('I should see 3 "submit" button elements')
    expect(out.pattern).toBe('I should see {int} {string} button elements')
    expect(out.paramTypes[0]).toBe('number')
  })

  it('uses snapshot textContent over identifier when available', () => {
    const labelled: IRElement = {
      ...buttonEl,
      elementSnapshot: { localName: 'button', textContent: 'Sign in' },
    }
    const out = mapIRStepToGherkin(ir({ action: 'click', element: labelled }), 'When')
    expect(out.text).toBe('I click the "Sign in" button')
  })

  it('humanizes camelCase identifiers and strips role suffixes', () => {
    const cancel: IRElement = {
      ...buttonEl,
      name: 'cancelOrderButton',
      elementSnapshot: undefined,
    }
    const out = mapIRStepToGherkin(ir({ action: 'click', element: cancel }), 'When')
    // strips Button suffix, splits camel-case
    expect(out.text).toBe('I click the "cancel Order" button')
  })
})

describe('mapInferredMethodToGherkin', () => {
  const page: IRPage = {
    name: 'Login',
    className: 'LoginPage',
    normalizedUrl: '/login',
    steps: [],
    elements: [],
  }

  it('login method → When I log in with email and password', () => {
    const method: InferredMethod = {
      name: 'login',
      params: ['email', 'password'],
      paramTypes: ['string', 'string'],
      steps: [
        { id: 's1', action: 'fill', element: emailEl, value: 'admin@example.com' },
        { id: 's2', action: 'fill', element: passwordEl, value: 'secret' },
        { id: 's3', action: 'click', element: buttonEl },
      ],
    }
    const out = mapInferredMethodToGherkin(method, page, null)
    expect(out.keyword).toBe('When')
    expect(out.text).toBe('I log in with email "admin@example.com" and password "secret"')
    expect(out.pattern).toBe('I log in with email {string} and password {string}')
    expect(out.params).toEqual(['admin@example.com', 'secret'])
  })

  it('search method → When I search for', () => {
    const method: InferredMethod = {
      name: 'search',
      params: ['query'],
      paramTypes: ['string'],
      steps: [
        { id: 's1', action: 'fill', element: emailEl, value: 'playwright' },
        { id: 's2', action: 'keypress', key: 'Enter' },
      ],
    }
    const out = mapInferredMethodToGherkin(method, page, null)
    expect(out.text).toBe('I search for "playwright"')
    expect(out.pattern).toBe('I search for {string}')
  })

  it('register method (registration context)', () => {
    const method: InferredMethod = {
      name: 'register',
      params: ['email', 'password'],
      paramTypes: ['string', 'string'],
      steps: [
        { id: 's1', action: 'fill', element: emailEl, value: 'new@user.com' },
        { id: 's2', action: 'fill', element: passwordEl, value: 'p@ss' },
        { id: 's3', action: 'click', element: buttonEl },
      ],
    }
    const out = mapInferredMethodToGherkin(method, page, null)
    expect(out.text).toBe('I register with email "new@user.com" and password "p@ss"')
  })

  it('acceptAndSubmit → no placeholders', () => {
    const method: InferredMethod = {
      name: 'acceptAndSubmit',
      params: ['consent'],
      paramTypes: ['boolean'],
      steps: [
        { id: 's1', action: 'click', element: checkboxEl },
        { id: 's2', action: 'click', element: buttonEl },
      ],
    }
    const out = mapInferredMethodToGherkin(method, page, null)
    expect(out.text).toBe('I accept and submit')
    expect(out.pattern).toBe('I accept and submit')
    expect(out.params).toEqual([false])
  })

  it('numeric collision suffix (login2) resolves to login template', () => {
    const method: InferredMethod = {
      name: 'login2',
      params: ['email', 'password'],
      paramTypes: ['string', 'string'],
      steps: [
        { id: 's1', action: 'fill', element: emailEl, value: 'second@admin.com' },
        { id: 's2', action: 'fill', element: passwordEl, value: 'pw2' },
        { id: 's3', action: 'click', element: buttonEl },
      ],
    }
    const out = mapInferredMethodToGherkin(method, page, null)
    expect(out.pattern).toBe('I log in with email {string} and password {string}')
    expect(out.params).toEqual(['second@admin.com', 'pw2'])
  })

  it('verifyX method → Then keyword', () => {
    const method: InferredMethod = {
      name: 'verifyDashboard',
      params: [],
      paramTypes: [],
      steps: [
        {
          id: 's1',
          action: 'assert',
          element: buttonEl,
          assertionDetail: { type: 'visible' },
        },
      ],
    }
    const out = mapInferredMethodToGherkin(method, page, 'When')
    // verify* maps to Then; previous was When so this stays Then
    expect(out.keyword).toBe('Then')
  })

  it('consecutive When methods become And', () => {
    const method: InferredMethod = {
      name: 'search',
      params: ['query'],
      paramTypes: ['string'],
      steps: [
        { id: 's1', action: 'fill', element: emailEl, value: 'q' },
        { id: 's2', action: 'keypress', key: 'Enter' },
      ],
    }
    const out = mapInferredMethodToGherkin(method, page, 'When')
    expect(out.keyword).toBe('And')
  })

  it('default click-prefixed method falls back to generic click line', () => {
    const method: InferredMethod = {
      name: 'clickCancelButton',
      params: [],
      paramTypes: [],
      steps: [{ id: 's1', action: 'click', element: buttonEl }],
    }
    const out = mapInferredMethodToGherkin(method, page, null)
    expect(out.text).toBe('I click the "cancel" element')
    expect(out.pattern).toBe('I click the {string} element')
  })
})

describe('mapScenarioToGherkin', () => {
  it('builds feature with Given + When/Then flow', () => {
    const loginPage: IRPage = {
      name: 'Login',
      className: 'LoginPage',
      normalizedUrl: '/login',
      steps: [
        { id: 's0', action: 'navigate', url: '/login' },
        { id: 's1', action: 'fill', element: emailEl, value: 'a@b.com' },
        { id: 's2', action: 'fill', element: passwordEl, value: 'pw' },
        { id: 's3', action: 'click', element: buttonEl },
      ],
      elements: [emailEl, passwordEl, buttonEl],
      inferredMethods: [
        {
          name: 'login',
          params: ['email', 'password'],
          paramTypes: ['string', 'string'],
          steps: [
            { id: 's1', action: 'fill', element: emailEl, value: 'a@b.com' },
            { id: 's2', action: 'fill', element: passwordEl, value: 'pw' },
            { id: 's3', action: 'click', element: buttonEl },
          ],
        },
      ],
    }
    const scenario: IRScenario = { name: 'User can log in', pages: [loginPage] }
    const feature = mapScenarioToGherkin(scenario)
    expect(feature.name).toBe('User can log in')
    expect(feature.scenarios).toHaveLength(1)
    const lines = feature.scenarios[0].steps
    // Given (page-entry) + When (login)
    expect(lines.map((l) => l.keyword)).toEqual(['Given', 'When'])
    expect(lines[0].text).toBe('I am on the "Login" page')
    expect(lines[1].text).toBe('I log in with email "a@b.com" and password "pw"')
  })

  it('falls back to per-step mapping when page has no inferred methods', () => {
    const page: IRPage = {
      name: 'Settings',
      className: 'SettingsPage',
      normalizedUrl: '/settings',
      steps: [
        { id: 's0', action: 'navigate', url: '/settings' },
        { id: 's1', action: 'click', element: buttonEl },
        { id: 's2', action: 'assert', element: buttonEl, assertionDetail: { type: 'visible' } },
      ],
      elements: [buttonEl],
    }
    const feature = mapScenarioToGherkin({ name: 'Settings flow', pages: [page] })
    const keywords = feature.scenarios[0].steps.map((s) => s.keyword)
    expect(keywords).toEqual(['Given', 'When', 'Then'])
  })

  it('drops network/wait steps from the narrative', () => {
    const page: IRPage = {
      name: 'Home',
      className: 'HomePage',
      normalizedUrl: '/',
      steps: [
        { id: 's0', action: 'navigate', url: '/' },
        {
          id: 's1',
          action: 'network',
          network: { method: 'GET', url: '/api/me', status: 200 },
        },
        {
          id: 's2',
          action: 'wait',
          wait: { reason: 'networkidle', timeoutMs: 10_000 },
        },
        { id: 's3', action: 'click', element: buttonEl },
      ],
      elements: [buttonEl],
    }
    const feature = mapScenarioToGherkin({ name: 'Home flow', pages: [page] })
    const actions = feature.scenarios[0].steps.map((s) => s.sourceSteps[0]?.action)
    expect(actions).not.toContain('network')
    expect(actions).not.toContain('wait')
  })

  it('multi-page scenario uses And for follow-up page entries', () => {
    const p1: IRPage = {
      name: 'Login',
      className: 'LoginPage',
      normalizedUrl: '/login',
      steps: [{ id: 's0', action: 'navigate', url: '/login' }],
      elements: [],
      inferredMethods: [
        {
          name: 'login',
          params: ['email', 'password'],
          paramTypes: ['string', 'string'],
          steps: [
            { id: 's1', action: 'fill', element: emailEl, value: 'a@b.com' },
            { id: 's2', action: 'fill', element: passwordEl, value: 'pw' },
            { id: 's3', action: 'click', element: buttonEl },
          ],
        },
      ],
    }
    const p2: IRPage = {
      name: 'Dashboard',
      className: 'DashboardPage',
      normalizedUrl: '/dashboard',
      steps: [{ id: 's10', action: 'navigate', url: '/dashboard' }],
      elements: [],
      inferredMethods: [
        {
          name: 'verifyWelcome',
          params: [],
          paramTypes: [],
          steps: [
            {
              id: 's11',
              action: 'assert',
              element: buttonEl,
              assertionDetail: { type: 'visible' },
            },
          ],
        },
      ],
    }
    const feature = mapScenarioToGherkin({ name: 'End-to-end', pages: [p1, p2] })
    const keywords = feature.scenarios[0].steps.map((s) => s.keyword)
    // Given (login page) / When (login) / And (dashboard nav) / Then (verify)
    expect(keywords).toEqual(['Given', 'When', 'And', 'Then'])
  })
})

describe('select / check / hover / dblclick', () => {
  const selectEl: IRElement = {
    name: 'countrySelect',
    locatorStrategy: 'testid',
    locatorValue: '[data-testid="country"]',
    tagName: 'select',
  }
  const rowEl: IRElement = {
    name: 'rowItem',
    locatorStrategy: 'testid',
    locatorValue: '[data-testid="row"]',
    tagName: 'tr',
  }

  it('select → I select "<value>" from the "<label>" dropdown', () => {
    const out = mapIRStepToGherkin(ir({ action: 'select', element: selectEl, value: 'tr' }), 'When')
    expect(out.text).toBe('I select "tr" from the "country" dropdown')
    expect(out.pattern).toBe('I select {string} from the {string} dropdown')
    expect(out.params).toEqual(['tr', 'country'])
  })

  it('check / uncheck → I check the "<label>" checkbox', () => {
    const on = mapIRStepToGherkin(ir({ action: 'check', element: checkboxEl }), 'When')
    const off = mapIRStepToGherkin(ir({ action: 'uncheck', element: checkboxEl }), 'When')
    expect(on.text).toBe('I check the "terms" checkbox')
    expect(off.text).toBe('I uncheck the "terms" checkbox')
    expect(on.params).toEqual(['terms'])
  })

  it('hover and dblclick get their own verbs', () => {
    const hover = mapIRStepToGherkin(ir({ action: 'hover', element: rowEl }), 'When')
    const dbl = mapIRStepToGherkin(ir({ action: 'dblclick', element: rowEl }), 'When')
    expect(hover.text).toBe('I hover over the "row Item" element')
    expect(dbl.text).toBe('I double-click the "row Item" element')
  })

  it('a selectX method keeps its recorded value as a step parameter', () => {
    const step = ir({ action: 'select', element: selectEl, value: 'tr' })
    const method: InferredMethod = {
      name: 'selectCountry',
      params: ['country'],
      paramTypes: ['string'],
      steps: [step],
    }
    const page: IRPage = {
      name: 'Checkout',
      className: 'CheckoutPage',
      normalizedUrl: '/checkout',
      elements: [selectEl],
      steps: [step],
      inferredMethods: [method],
    }
    const out = mapInferredMethodToGherkin(method, page, null)
    expect(out.text).toBe('I select "tr" from the country')
    expect(out.pattern).toBe('I select {string} from the country')
    expect(out.params).toEqual(['tr'])
  })

  it('a check step supplies true for the boolean parameter', () => {
    const step = ir({ action: 'check', element: checkboxEl })
    const method: InferredMethod = {
      name: 'acceptAndSubmit',
      params: ['terms'],
      paramTypes: ['boolean'],
      steps: [step],
    }
    const page: IRPage = {
      name: 'Signup',
      className: 'SignupPage',
      normalizedUrl: '/signup',
      elements: [checkboxEl],
      steps: [step],
      inferredMethods: [method],
    }
    expect(mapInferredMethodToGherkin(method, page, null).params).toEqual([true])
  })

  it('checkX / hoverX / doubleClickX methods map to a parameterless sentence', () => {
    const page: IRPage = {
      name: 'P',
      className: 'PPage',
      normalizedUrl: '/p',
      elements: [],
      steps: [],
    }
    const make = (name: string): InferredMethod => ({ name, params: [], steps: [] })
    expect(mapInferredMethodToGherkin(make('checkTerms'), page, null).text).toBe(
      'I check the terms',
    )
    expect(mapInferredMethodToGherkin(make('uncheckTerms'), page, null).text).toBe(
      'I uncheck the terms',
    )
    expect(mapInferredMethodToGherkin(make('hoverAccountMenu'), page, null).text).toBe(
      'I hover over the account menu',
    )
    expect(mapInferredMethodToGherkin(make('doubleClickRowItem'), page, null).text).toBe(
      'I double-click the row item',
    )
  })
})
