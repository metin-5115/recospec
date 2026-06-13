import { describe, it, expect } from 'vitest'
import { renderPageObject, toConstName } from './page-object'
import type { IRPage, IRElement, InferredMethod } from '../../ir/types'

const emailEl: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="login-email"]',
  tagName: 'input',
}

const passwordEl: IRElement = {
  name: 'passwordInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="login-password"]',
  tagName: 'input',
}

const signInEl: IRElement = {
  name: 'signInButton',
  locatorStrategy: 'role-name',
  locatorValue: `'button', { name: 'Sign In' }`,
  tagName: 'button',
}

const loginMethod: InferredMethod = {
  name: 'login',
  params: ['email', 'password'],
  steps: [
    { id: 'm1', action: 'fill', element: emailEl, value: 'user@example.com' },
    { id: 'm2', action: 'fill', element: passwordEl, value: 'secret' },
    { id: 'm3', action: 'click', element: signInEl },
  ],
}

const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [emailEl, passwordEl, signInEl],
  steps: [
    { id: 's1', action: 'navigate', url: '/login' },
    { id: 's2', action: 'fill', element: emailEl, value: 'user@example.com' },
    { id: 's3', action: 'fill', element: passwordEl, value: 'secret' },
    { id: 's4', action: 'click', element: signInEl },
  ],
  inferredMethods: [loginMethod],
}

describe('selenium-py renderPageObject', () => {
  it('matches snapshot for LoginPage with login() method', () => {
    expect(renderPageObject(loginPage)).toMatchSnapshot()
  })

  it('emits selenium imports', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('from selenium.webdriver.common.by import By')
    expect(out).toContain('from selenium.webdriver.support.ui import WebDriverWait')
    expect(out).toContain('from selenium.webdriver.support import expected_conditions as EC')
  })

  it('declares the page class', () => {
    expect(renderPageObject(loginPage)).toContain('class LoginPage:')
  })

  it('emits By.CSS_SELECTOR tuple for testid strategy', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain(`EMAIL_INPUT = (By.CSS_SELECTOR, '[data-testid="login-email"]')`)
  })

  it('emits By.XPATH tuple for role-name strategy', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain(`SIGN_IN_BUTTON = (By.XPATH, "//button[normalize-space()='Sign In']")`)
  })

  it('emits __init__ with WebDriverWait', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('def __init__(self, driver):')
    expect(out).toContain('self.wait = WebDriverWait(driver, 10)')
  })

  it('emits goto() helper using driver.get', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('def goto(self):')
    expect(out).toContain("self.driver.get('/login')")
  })

  it('renders inferred login(email, password) with typed params', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('def login(self, email: str, password: str):')
    expect(out).toContain('_el.send_keys(email)')
    expect(out).toContain('_el.send_keys(password)')
    expect(out).toMatch(/element_to_be_clickable\(self\.SIGN_IN_BUTTON\)\)\.click\(\)/)
  })
})

describe('selenium-py renderPageObject — fallback comments', () => {
  it('renders fallback tuples below the primary constant', () => {
    const elementWithFallbacks: IRElement = {
      name: 'emailInput',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="email"]',
      tagName: 'input',
      fallbackLocators: [
        { strategy: 'aria-label', locatorValue: '[aria-label="Email"]' },
        { strategy: 'role-name', locatorValue: `'textbox', { name: 'Email' }` },
      ],
    }
    const page: IRPage = {
      name: 'Login',
      className: 'LoginPage',
      normalizedUrl: '/login',
      elements: [elementWithFallbacks],
      steps: [{ id: 's1', action: 'navigate', url: '/login' }],
    }
    const out = renderPageObject(page)
    expect(out).toContain(
      `# Fallbacks: (By.CSS_SELECTOR, '[aria-label="Email"]'), (By.XPATH, "//*[normalize-space()='Email']")`,
    )
  })
})

describe('selenium-py renderPageObject — fallback method', () => {
  it('falls back to perform_steps when no inferred methods', () => {
    const page: IRPage = { ...loginPage, inferredMethods: undefined }
    const out = renderPageObject(page)
    expect(out).toContain('def perform_steps(self):')
  })
})

describe('selenium-py renderPageObject — assertions', () => {
  const page: IRPage = {
    name: 'Home',
    className: 'HomePage',
    normalizedUrl: '/',
    elements: [signInEl],
    steps: [
      { id: 'a1', action: 'navigate', url: '/' },
      {
        id: 'a2',
        action: 'assert',
        element: signInEl,
        assertionDetail: { type: 'visible' },
      },
      {
        id: 'a3',
        action: 'assert',
        element: signInEl,
        assertionDetail: { type: 'text', expected: 'Sign In' },
      },
      {
        id: 'a3b',
        action: 'assert',
        element: signInEl,
        assertionDetail: { type: 'text-contains', expected: 'Sign' },
      },
      {
        id: 'a4',
        action: 'assert',
        element: signInEl,
        assertionDetail: { type: 'count', expected: 2 },
      },
    ],
  }

  it('renders visibility_of_element_located', () => {
    expect(renderPageObject(page)).toContain('visibility_of_element_located(self.SIGN_IN_BUTTON)')
  })

  it('renders text equality assertion', () => {
    expect(renderPageObject(page)).toContain(
      `self.driver.find_element(*self.SIGN_IN_BUTTON).text == 'Sign In'`,
    )
  })

  it('renders text-contains assertion using `in`', () => {
    expect(renderPageObject(page)).toContain(
      `'Sign' in self.driver.find_element(*self.SIGN_IN_BUTTON).text`,
    )
  })

  it('renders count assertion via find_elements', () => {
    expect(renderPageObject(page)).toContain(
      'len(self.driver.find_elements(*self.SIGN_IN_BUTTON)) == 2',
    )
  })
})

describe('selenium-py — toConstName', () => {
  it('upper-snake-cases camelCase input', () => {
    expect(toConstName('emailInput')).toBe('EMAIL_INPUT')
    expect(toConstName('signInButton')).toBe('SIGN_IN_BUTTON')
    expect(toConstName('foo')).toBe('FOO')
  })

  it('handles numeric segments', () => {
    expect(toConstName('item1Button')).toBe('ITEM1_BUTTON')
  })
})
