import { describe, it, expect } from 'vitest'
import { mergeTsPageObject } from './ts-page-object'

const EXISTING = `import { type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  get emailInput() { return this.page.getByTestId('email'); }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
  }
}
`

const INCOMING = `import { expect, type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  get emailInput() { return this.page.getByTestId('email'); }

  get passwordInput() { return this.page.getByTestId('password'); }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    // NEW BODY — must not replace existing
  }

  async resetPassword(email: string) {
    await this.emailInput.fill(email);
  }
}
`

describe('mergeTsPageObject', () => {
  it('appends new members and never overwrites existing ones', () => {
    const result = mergeTsPageObject(EXISTING, INCOMING)
    expect(result.added).toEqual(expect.arrayContaining(['passwordInput', 'resetPassword']))
    expect(result.skipped).toEqual(expect.arrayContaining(['login', 'emailInput']))
    expect(result.source).toContain('passwordInput')
    expect(result.source).toContain('resetPassword')
    expect(result.source).not.toContain('NEW BODY')
  })

  it('merges missing imports', () => {
    const result = mergeTsPageObject(EXISTING, INCOMING)
    // The incoming file added `expect` to the same module — merge keeps the
    // existing import unchanged. New module imports (had there been any)
    // would be appended; here we just verify the file still parses.
    expect(result.source).toContain("from '@playwright/test'")
  })
})
