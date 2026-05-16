import { describe, it, expect, beforeEach } from 'vitest'
import type { IRElement, IRPage, IRScenario, TestDataConfig } from '../ir/types'
import { playwrightTsAdapter } from './playwright-ts'
import { cypressAdapter } from './cypress'
import { seleniumPyAdapter } from './selenium-py'
import { seleniumJavaAdapter } from './selenium-java'

// ---------------------------------------------------------------------------
// Shared fixture: a login page where the password is auto-detected as secret.
// ---------------------------------------------------------------------------

const usernameEl: IRElement = {
  name: 'usernameInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="login-username"]',
  tagName: 'input',
}

const passwordEl: IRElement = {
  name: 'passwordInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="login-password"]',
  tagName: 'input',
  inputType: 'password',
}

const submitEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'role-name',
  locatorValue: `'button', { name: 'Submit' }`,
  tagName: 'button',
}

const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [usernameEl, passwordEl, submitEl],
  steps: [
    { id: 's1', action: 'navigate', url: '/login' },
    { id: 's2', action: 'fill', element: usernameEl, value: 'alice' },
    { id: 's3', action: 'fill', element: passwordEl, value: 'hunter2' },
    { id: 's4', action: 'click', element: submitEl },
  ],
}

const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }

// ---------------------------------------------------------------------------
// Per-adapter env-var rendering tests
// ---------------------------------------------------------------------------

describe('test-data parameterization — playwright-ts', () => {
  beforeEach(() => {
    playwrightTsAdapter.applyOptions?.({ testData: undefined })
  })

  it('renders process.env.X ?? default for password fields by default', () => {
    const out = playwrightTsAdapter.renderScenario(scenario)
    expect(out.content).toContain(`process.env.PLAYFORGE_PASSWORD ?? "change-me"`)
    expect(out.content).not.toContain(`fill("hunter2")`)
  })

  it('keeps non-secret literals untouched', () => {
    const out = playwrightTsAdapter.renderScenario(scenario)
    expect(out.content).toContain(`fill("alice")`)
  })

  it('respects user-overridden default values', () => {
    const cfg: TestDataConfig = {
      params: [
        {
          key: 'passwordInput',
          name: 'password',
          isSecret: true,
          defaultValue: 'demo123',
          useEnvVar: true,
          envVarName: 'PLAYFORGE_PASSWORD',
        },
      ],
    }
    playwrightTsAdapter.applyOptions?.({ testData: cfg })
    const out = playwrightTsAdapter.renderScenario(scenario)
    expect(out.content).toContain(`process.env.PLAYFORGE_PASSWORD ?? "demo123"`)
  })

  it('emits .env.example only when env-var params exist', () => {
    playwrightTsAdapter.applyOptions?.({ testData: { params: [] } })
    expect(playwrightTsAdapter.renderScaffold().some((f) => f.filename === '.env.example')).toBe(
      false,
    )
    playwrightTsAdapter.applyOptions?.({
      testData: {
        params: [
          {
            key: 'p',
            name: 'password',
            isSecret: true,
            defaultValue: 'change-me',
            useEnvVar: true,
            envVarName: 'PLAYFORGE_PASSWORD',
          },
        ],
      },
    })
    const env = playwrightTsAdapter.renderScaffold().find((f) => f.filename === '.env.example')
    expect(env?.content).toContain('PLAYFORGE_PASSWORD=')
  })
})

describe('test-data parameterization — cypress', () => {
  beforeEach(() => {
    cypressAdapter.applyOptions?.({ testData: undefined })
  })

  it('renders Cypress.env() || default for sensitive fields', () => {
    const out = cypressAdapter.renderScenario(scenario)
    expect(out.content).toContain(`Cypress.env("password") || "change-me"`)
    expect(out.content).not.toContain(`type("hunter2")`)
  })

  it('emits cypress.env.json.example when sensitive params exist', () => {
    cypressAdapter.applyOptions?.({
      testData: {
        params: [
          {
            key: 'p',
            name: 'password',
            isSecret: true,
            defaultValue: 'change-me',
            useEnvVar: true,
            envVarName: 'PLAYFORGE_PASSWORD',
          },
        ],
      },
    })
    const env = cypressAdapter
      .renderScaffold()
      .find((f) => f.filename === 'cypress.env.json.example')
    expect(env?.content).toContain('"password"')
  })
})

describe('test-data parameterization — selenium-py', () => {
  beforeEach(() => {
    seleniumPyAdapter.applyOptions?.({ testData: undefined })
  })

  it('renders os.environ.get(VAR, default) for password fields', () => {
    const out = seleniumPyAdapter.renderScenario(scenario)
    expect(out.content).toContain(`os.environ.get('PLAYFORGE_PASSWORD', 'change-me')`)
  })

  it('inserts `import os` only when env-var lookups are present', () => {
    seleniumPyAdapter.applyOptions?.({
      testData: {
        params: [
          {
            key: 'p',
            name: 'password',
            isSecret: true,
            defaultValue: 'change-me',
            useEnvVar: true,
            envVarName: 'PLAYFORGE_PASSWORD',
          },
        ],
      },
    })
    const out = seleniumPyAdapter.renderScenario(scenario)
    expect(out.content).toContain('import os')
  })

  it('emits .env.example when env-var params exist', () => {
    seleniumPyAdapter.applyOptions?.({
      testData: {
        params: [
          {
            key: 'p',
            name: 'password',
            isSecret: true,
            defaultValue: 'change-me',
            useEnvVar: true,
            envVarName: 'PLAYFORGE_PASSWORD',
          },
        ],
      },
    })
    const env = seleniumPyAdapter.renderScaffold().find((f) => f.filename === '.env.example')
    expect(env?.content).toContain('PLAYFORGE_PASSWORD=')
  })
})

describe('test-data parameterization — selenium-java', () => {
  beforeEach(() => {
    seleniumJavaAdapter.applyOptions?.({ testData: undefined })
  })

  it('renders System.getenv().getOrDefault for password fields', () => {
    const out = seleniumJavaAdapter.renderScenario(scenario)
    expect(out.content).toContain(`System.getenv().getOrDefault("PLAYFORGE_PASSWORD", "change-me")`)
  })

  it('emits test-data.properties.example under src/test/resources when params exist', () => {
    seleniumJavaAdapter.applyOptions?.({
      testData: {
        params: [
          {
            key: 'p',
            name: 'password',
            isSecret: true,
            defaultValue: 'change-me',
            useEnvVar: true,
            envVarName: 'PLAYFORGE_PASSWORD',
          },
        ],
      },
    })
    const props = seleniumJavaAdapter
      .renderScaffold()
      .find((f) => f.filename === 'src/test/resources/test-data.properties.example')
    expect(props?.content).toContain('PLAYFORGE_PASSWORD=')
  })
})

describe('test-data parameterization — secret values are never logged', () => {
  it('logger.redact masks password-shaped fields', async () => {
    const { logger } = await import('@shared/logger')
    const result = logger.redact({ user: 'alice', password: 'hunter2', nested: { token: 'abc' } })
    expect(result).toEqual({ user: 'alice', password: '***', nested: { token: '***' } })
  })
})
