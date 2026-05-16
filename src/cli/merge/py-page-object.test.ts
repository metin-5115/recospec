import { describe, it, expect } from 'vitest'
import { mergePyPageObject } from './py-page-object'

const EXISTING = `from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

class LoginPage:
    EMAIL_INPUT = (By.CSS_SELECTOR, '[data-testid="email"]')

    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 10)

    def login(self, email, password):
        self.wait.until(lambda d: d.find_element(*self.EMAIL_INPUT)).send_keys(email)
`

const INCOMING = `import os
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

class LoginPage:
    EMAIL_INPUT = (By.CSS_SELECTOR, '[data-testid="email"]')
    PASSWORD_INPUT = (By.CSS_SELECTOR, '[data-testid="password"]')

    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 10)

    def login(self, email, password):
        # NEW BODY — should NOT replace existing method
        pass

    def reset_password(self, email):
        self.wait.until(lambda d: d.find_element(*self.EMAIL_INPUT)).send_keys(email)
`

describe('mergePyPageObject', () => {
  it('appends new methods + constants and preserves existing method bodies', () => {
    const result = mergePyPageObject(EXISTING, INCOMING)

    expect(result.added).toContain('PASSWORD_INPUT')
    expect(result.added).toContain('reset_password')
    expect(result.skipped).toContain('login')
    expect(result.skipped).toContain('EMAIL_INPUT')

    // The existing `login` body must survive untouched.
    expect(result.source).toContain('send_keys(email)')
    expect(result.source).not.toContain('# NEW BODY')

    // New members must appear.
    expect(result.source).toMatch(/PASSWORD_INPUT\s*=/)
    expect(result.source).toMatch(/def reset_password\(self, email\):/)
  })

  it('merges missing import statements', () => {
    const result = mergePyPageObject(EXISTING, INCOMING)
    expect(result.source).toMatch(/^import os/m)
    // Existing imports are not duplicated.
    const fromCount = (result.source.match(/from selenium\.webdriver\.common\.by import By/g) || [])
      .length
    expect(fromCount).toBe(1)
  })

  it('is a no-op when incoming has no new members', () => {
    const result = mergePyPageObject(EXISTING, EXISTING)
    expect(result.added).toEqual([])
    expect(result.skipped.length).toBeGreaterThan(0)
  })
})
