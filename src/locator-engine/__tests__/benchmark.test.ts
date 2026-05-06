import { describe, it, expect } from 'vitest'
import { LocatorEngine } from '../index'

const SIMPLE_FORM_HTML = `<!doctype html>
<html lang="en">
  <body>
    <form id="login-form">
      <label for="email">Email</label>
      <input id="email" type="email" data-testid="login-email" placeholder="user@example.com" />
      <label for="password">Password</label>
      <input id="password" type="password" data-testid="login-password" />
      <button type="submit" data-testid="login-submit" aria-label="Sign In">Sign In</button>
    </form>
  </body>
</html>`

const MATERIAL_UI_HTML = `<!doctype html>
<html lang="en">
  <body>
    <form class="MuiFormControl-root css-1a2b3c" id="signup-form">
      <label for="mui-username" class="MuiInputLabel-root css-9d2f4e">Username</label>
      <input id="mui-username" type="text" name="username"
        class="MuiInputBase-input css-7f3q8r" aria-label="Username" />
      <label for="mui-email" class="MuiInputLabel-root css-9d2f4e">Email</label>
      <input id="mui-email" type="email" name="email"
        class="MuiInputBase-input css-7f3q8r" aria-label="Email address" />
      <button type="submit" class="MuiButton-root css-5x3q1a" aria-label="Create account">
        Create account
      </button>
    </form>
  </body>
</html>`

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('Locator Engine — simple-form fixture', () => {
  const engine = new LocatorEngine()

  it('email input primary strategy is testid', () => {
    const doc = parseHtml(SIMPLE_FORM_HTML)
    const el = doc.querySelector('[data-testid="login-email"]') as Element
    const bundle = engine.evaluate(el, doc)

    expect(bundle).not.toBeNull()
    expect(bundle!.primary.strategy).toBe('testid')
  })

  it('password input primary strategy is testid', () => {
    const doc = parseHtml(SIMPLE_FORM_HTML)
    const el = doc.querySelector('[data-testid="login-password"]') as Element
    const bundle = engine.evaluate(el, doc)

    expect(bundle!.primary.strategy).toBe('testid')
  })

  it('submit button primary strategy is testid', () => {
    const doc = parseHtml(SIMPLE_FORM_HTML)
    const el = doc.querySelector('[data-testid="login-submit"]') as Element
    const bundle = engine.evaluate(el, doc)

    expect(bundle!.primary.strategy).toBe('testid')
  })
})

describe('Locator Engine — material-ui-like fixture', () => {
  const engine = new LocatorEngine()

  it('username input does not use css or xpath as primary', () => {
    const doc = parseHtml(MATERIAL_UI_HTML)
    const el = doc.querySelector('input[name="username"]') as Element
    const bundle = engine.evaluate(el, doc)

    expect(bundle!.primary.strategy).not.toBe('css')
    expect(bundle!.primary.strategy).not.toBe('xpath')
    expect(bundle!.primary.score).toBeGreaterThanOrEqual(50)
  })

  it('email input does not use css or xpath as primary', () => {
    const doc = parseHtml(MATERIAL_UI_HTML)
    const el = doc.querySelector('input[name="email"]') as Element
    const bundle = engine.evaluate(el, doc)

    expect(bundle!.primary.strategy).not.toBe('css')
    expect(bundle!.primary.strategy).not.toBe('xpath')
  })

  it('submit button does not use css or xpath as primary', () => {
    const doc = parseHtml(MATERIAL_UI_HTML)
    const el = doc.querySelector('button[type="submit"]') as Element
    const bundle = engine.evaluate(el, doc)

    expect(bundle!.primary.strategy).not.toBe('css')
    expect(bundle!.primary.strategy).not.toBe('xpath')
  })
})
