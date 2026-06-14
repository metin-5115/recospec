import { describe, it, expect } from 'vitest'
import { renderPageObject, toJavaFieldName } from './page-object'
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

describe('selenium-java renderPageObject', () => {
  it('matches snapshot for LoginPage with login() method', () => {
    expect(renderPageObject(loginPage)).toMatchSnapshot()
  })

  it('emits selenium imports', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('import org.openqa.selenium.WebDriver;')
    expect(out).toContain('import org.openqa.selenium.support.FindBy;')
    expect(out).toContain('import org.openqa.selenium.support.PageFactory;')
    expect(out).toContain('import org.openqa.selenium.support.ui.WebDriverWait;')
  })

  it('declares package and class', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('package pages;')
    expect(out).toContain('public class LoginPage {')
  })

  it('emits @FindBy(css = ...) for testid strategy', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('@FindBy(css = "[data-testid=\\"login-email\\"]")')
    expect(out).toContain('private WebElement emailInput;')
  })

  it('emits @FindBy(xpath = ...) for role-name strategy', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain(`@FindBy(xpath = "//button[normalize-space()='Sign In']")`)
    expect(out).toContain('private WebElement signInButton;')
  })

  it('constructor calls PageFactory.initElements', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('public LoginPage(WebDriver driver) {')
    expect(out).toContain('PageFactory.initElements(driver, this);')
  })

  it('emits goTo() helper using driver.get', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('public void goTo() {')
    expect(out).toContain(`driver.get("/login");`)
  })

  it('renders inferred login(String email, String password) with typed params', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('public void login(String email, String password) {')
    expect(out).toContain('emailInput.sendKeys(email);')
    expect(out).toContain('passwordInput.sendKeys(password);')
    expect(out).toMatch(/elementToBeClickable\(signInButton\)\)\.click\(\);/)
  })
})

describe('selenium-java renderPageObject — fallback comments', () => {
  it('renders fallback annotations below the primary @FindBy', () => {
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
      `// Fallbacks: @FindBy(css = "[aria-label=\\"Email\\"]"), @FindBy(xpath = "//*[normalize-space()='Email']")`,
    )
  })
})

describe('selenium-java renderPageObject — fallback method', () => {
  it('falls back to performSteps() when no inferred methods', () => {
    const page: IRPage = { ...loginPage, inferredMethods: undefined }
    const out = renderPageObject(page)
    expect(out).toContain('public void performSteps() {')
  })
})

describe('selenium-java renderPageObject — assertions', () => {
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

  it('renders visibilityOf assertion', () => {
    expect(renderPageObject(page)).toContain('ExpectedConditions.visibilityOf(signInButton)')
  })

  it('renders text equality assertion', () => {
    expect(renderPageObject(page)).toContain(`signInButton.getText().equals("Sign In")`)
  })

  it('renders text-contains assertion via getText().contains(...)', () => {
    expect(renderPageObject(page)).toContain(`signInButton.getText().contains("Sign")`)
  })

  it('renders count assertion via findElements', () => {
    expect(renderPageObject(page)).toContain('driver.findElements(')
    expect(renderPageObject(page)).toContain(').size() == 2;')
  })
})

describe('selenium-java — toJavaFieldName', () => {
  it('preserves camelCase input', () => {
    expect(toJavaFieldName('emailInput')).toBe('emailInput')
    expect(toJavaFieldName('signInButton')).toBe('signInButton')
  })

  it('lowercases first character of single PascalCase token', () => {
    expect(toJavaFieldName('Foo')).toBe('foo')
  })

  it('escapes Java reserved words', () => {
    expect(toJavaFieldName('class')).toBe('_class')
    expect(toJavaFieldName('return')).toBe('_return')
  })

  it('escapes leading-digit identifiers', () => {
    expect(toJavaFieldName('1stItem')).toBe('_1stItem')
  })
})

describe('assertion codegen — dynamic value modes', () => {
  const pattern = '\\d+ TRY'
  const dynPage: IRPage = {
    name: 'Hotels',
    className: 'HotelsPage',
    normalizedUrl: '/',
    elements: [emailEl],
    steps: [
      { id: 'd1', action: 'assert', element: emailEl, assertionDetail: { type: 'not-empty' } },
      {
        id: 'd2',
        action: 'assert',
        element: emailEl,
        assertionDetail: { type: 'matches', expected: pattern },
      },
    ],
  }

  it('renders a non-empty text assertion', () => {
    expect(renderPageObject(dynPage)).toContain('.getText().trim().isEmpty()')
  })

  it('renders a regex matcher for matches', () => {
    expect(renderPageObject(dynPage)).toContain('java.util.regex.Pattern.compile(')
  })
})
