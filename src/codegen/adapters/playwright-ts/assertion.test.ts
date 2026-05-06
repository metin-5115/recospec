import { describe, it, expect } from 'vitest'
import { renderPageObject, renderScenario } from './index'
import type { IRPage, IRScenario, IRElement } from '../../ir/types'

const buttonEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: 'submit-btn',
  tagName: 'button',
}

const headingEl: IRElement = {
  name: 'welcomeHeading',
  locatorStrategy: 'text',
  locatorValue: 'Welcome',
  tagName: 'h1',
}

const inputEl: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'aria-label',
  locatorValue: '[aria-label="Email"]',
  tagName: 'input',
}

const pageWithAssertions: IRPage = {
  name: 'Home',
  className: 'HomePage',
  normalizedUrl: '/',
  elements: [buttonEl, headingEl, inputEl],
  steps: [
    { id: 's1', action: 'navigate', url: '/' },
    {
      id: 's2',
      action: 'assert',
      element: buttonEl,
      assertionDetail: { type: 'visible' },
      annotation: 'Expect visible',
    },
    {
      id: 's3',
      action: 'assert',
      element: headingEl,
      assertionDetail: { type: 'text', expected: 'Welcome' },
      annotation: 'Expect text: "Welcome"',
    },
    {
      id: 's4',
      action: 'assert',
      element: inputEl,
      assertionDetail: { type: 'value', expected: 'user@example.com' },
      annotation: 'Expect value',
    },
    {
      id: 's5',
      action: 'assert',
      element: buttonEl,
      assertionDetail: { type: 'hidden' },
      annotation: 'Expect hidden',
    },
    {
      id: 's6',
      action: 'assert',
      element: inputEl,
      assertionDetail: { type: 'attribute', attribute: 'disabled', expected: '' },
      annotation: 'Expect attribute',
    },
    {
      id: 's7',
      action: 'assert',
      element: buttonEl,
      assertionDetail: { type: 'count', expected: 2 },
      annotation: 'Expect count',
    },
  ],
}

describe('assertion codegen — renderPageObject', () => {
  it('matches snapshot', () => {
    expect(renderPageObject(pageWithAssertions)).toMatchSnapshot()
  })

  it('renders toBeVisible for visible assertion', () => {
    const out = renderPageObject(pageWithAssertions)
    expect(out).toContain('await expect(this.submitBtn).toBeVisible()')
  })

  it('renders toHaveText for text assertion', () => {
    const out = renderPageObject(pageWithAssertions)
    expect(out).toContain('await expect(this.welcomeHeading).toHaveText("Welcome")')
  })

  it('renders toHaveValue for value assertion', () => {
    const out = renderPageObject(pageWithAssertions)
    expect(out).toContain('await expect(this.emailInput).toHaveValue("user@example.com")')
  })

  it('renders toBeHidden for hidden assertion', () => {
    const out = renderPageObject(pageWithAssertions)
    expect(out).toContain('await expect(this.submitBtn).toBeHidden()')
  })

  it('renders toHaveAttribute for attribute assertion', () => {
    const out = renderPageObject(pageWithAssertions)
    expect(out).toContain('await expect(this.emailInput).toHaveAttribute("disabled", "")')
  })

  it('renders toHaveCount for count assertion', () => {
    const out = renderPageObject(pageWithAssertions)
    expect(out).toContain('await expect(this.submitBtn).toHaveCount(2)')
  })
})

describe('assertion codegen — renderScenario', () => {
  it('matches snapshot', () => {
    const scenario: IRScenario = { name: 'Assertion flow', pages: [pageWithAssertions] }
    expect(renderScenario(scenario)).toMatchSnapshot()
  })

  it('renders expect() in spec file using locator syntax', () => {
    const scenario: IRScenario = { name: 'Assertion flow', pages: [pageWithAssertions] }
    const out = renderScenario(scenario)
    expect(out).toContain('await expect(page.getByTestId(')
    expect(out).toContain('.toBeVisible()')
  })

  it('falls back to comment when no assertionDetail', () => {
    const page: IRPage = {
      ...pageWithAssertions,
      steps: [{ id: 'x', action: 'assert', annotation: 'manual check' }],
    }
    const scenario: IRScenario = { name: 'Manual', pages: [page] }
    const out = renderScenario(scenario)
    expect(out).toContain('// assert: manual check')
  })
})
