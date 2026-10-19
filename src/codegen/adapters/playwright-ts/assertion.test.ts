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
      id: 's3b',
      action: 'assert',
      element: headingEl,
      assertionDetail: { type: 'text-contains', expected: 'Wel' },
      annotation: 'Expect text contains',
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

  it('renders toContainText for text-contains assertion', () => {
    const out = renderPageObject(pageWithAssertions)
    expect(out).toContain('await expect(this.welcomeHeading).toContainText("Wel")')
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

describe('assertion codegen — page object imports', () => {
  it('imports expect when a method body asserts', () => {
    expect(renderPageObject(pageWithAssertions)).toContain(
      "import { expect, type Page } from '@playwright/test';",
    )
  })

  it('keeps the Page-only import when nothing asserts', () => {
    const page: IRPage = {
      ...pageWithAssertions,
      steps: [{ id: 's1', action: 'navigate', url: '/' }],
    }
    const out = renderPageObject(page)
    expect(out).toContain("import { type Page } from '@playwright/test';")
    expect(out).not.toContain('expect')
  })
})

describe('assertion codegen — screenshot', () => {
  const screenshotPage: IRPage = {
    name: 'Home',
    className: 'HomePage',
    normalizedUrl: '/',
    elements: [],
    steps: [
      { id: 's1', action: 'navigate', url: '/' },
      {
        id: 's2',
        action: 'assert',
        assertionDetail: { type: 'screenshot', name: 'home', threshold: 0.3 },
      },
    ],
  }

  it('renders toHaveScreenshot in page object using this.page', () => {
    const out = renderPageObject(screenshotPage)
    expect(out).toContain(
      `await expect(this.page).toHaveScreenshot("home.png", { threshold: 0.3 });`,
    )
  })

  it('renders toHaveScreenshot in spec using page', () => {
    const scenario: IRScenario = { name: 'Visual flow', pages: [screenshotPage] }
    const out = renderScenario(scenario)
    expect(out).toContain(`await expect(page).toHaveScreenshot("home.png", { threshold: 0.3 });`)
  })

  it('falls back to default name and threshold when not provided', () => {
    const page: IRPage = {
      ...screenshotPage,
      steps: [{ id: 'x', action: 'assert', assertionDetail: { type: 'screenshot' } }],
    }
    const out = renderPageObject(page)
    expect(out).toContain(
      `await expect(this.page).toHaveScreenshot("snapshot.png", { threshold: 0.2 });`,
    )
  })
})

describe('assertion codegen — dynamic value modes (not-empty / matches)', () => {
  const pattern = '\\d+ TRY'
  const dynPage: IRPage = {
    name: 'Hotels',
    className: 'HotelsPage',
    normalizedUrl: '/',
    elements: [headingEl],
    steps: [
      { id: 'd1', action: 'assert', element: headingEl, assertionDetail: { type: 'not-empty' } },
      {
        id: 'd2',
        action: 'assert',
        element: headingEl,
        assertionDetail: { type: 'matches', expected: pattern },
      },
    ],
  }

  it('renders not.toBeEmpty for not-empty', () => {
    expect(renderPageObject(dynPage)).toContain(
      'await expect(this.welcomeHeading).not.toBeEmpty();',
    )
  })

  it('renders toHaveText(new RegExp(...)) for matches (literal value never embedded)', () => {
    const out = renderPageObject(dynPage)
    expect(out).toContain(
      `await expect(this.welcomeHeading).toHaveText(new RegExp(${JSON.stringify(pattern)}));`,
    )
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
