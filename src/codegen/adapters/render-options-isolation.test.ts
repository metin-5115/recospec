import { describe, it, expect } from 'vitest'
import type { IRElement, IRPage, IRScenario, TestDataConfig } from '../ir/types'
import type { FrameworkAdapter, RenderOptions } from './registry'
import { playwrightTsAdapter } from './playwright-ts'
import { cypressAdapter } from './cypress'
import { seleniumPyAdapter } from './selenium-py'
import { seleniumJavaAdapter } from './selenium-java'

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
const submitEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="submit"]',
  tagName: 'button',
}

const page: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [emailEl, passwordEl, submitEl],
  steps: [
    { id: 's0', action: 'navigate', url: '/login' },
    { id: 's1', action: 'fill', element: emailEl, value: 'a@b.com' },
    { id: 's2', action: 'fill', element: passwordEl, value: 'hunter2' },
    { id: 's3', action: 'click', element: submitEl },
    {
      id: 's4',
      action: 'network',
      network: {
        method: 'POST',
        url: 'https://api.example.com/login',
        status: 200,
        contentType: 'application/json',
        responseBody: '{"token":"abc"}',
      },
    },
  ],
}
const scenario: IRScenario = { name: 'Login flow', pages: [page] }

const testData: TestDataConfig = {
  params: [
    {
      key: 'passwordInput',
      name: 'password',
      isSecret: true,
      defaultValue: 'leaky-default',
      useEnvVar: true,
      envVarName: 'RECOSPEC_PASSWORD',
    },
  ],
}

function renderAll(adapter: FrameworkAdapter, options?: RenderOptions): string[] {
  return [
    adapter.renderPageObject(page, options).content,
    adapter.renderScenario(scenario, options).content,
    ...adapter.renderScaffold(options).map(
      (f) => `${f.filename}
${f.content}`,
    ),
  ]
}

const ADAPTERS: FrameworkAdapter[] = [
  playwrightTsAdapter,
  cypressAdapter,
  seleniumPyAdapter,
  seleniumJavaAdapter,
]

describe.each(ADAPTERS)('render options do not leak between calls — $id', (adapter) => {
  it('a render without options ignores a previous render with includeMocks/testData', () => {
    const baseline = renderAll(adapter)

    const configured = renderAll(adapter, { includeMocks: true, testData })
    expect(configured).not.toEqual(baseline)

    expect(renderAll(adapter)).toEqual(baseline)
  })

  it('two renders with different options do not influence each other', () => {
    const withData = renderAll(adapter, { testData })
    renderAll(adapter, { includeMocks: true })
    expect(renderAll(adapter, { testData })).toEqual(withData)
  })
})

describe('selenium-java postProcess reads bdd from its options', () => {
  const files = [
    { filename: 'testng.xml', content: '' },
    { filename: 'pom.xml', content: '' },
  ]

  it('strips testng.xml only when bdd is requested for that call', () => {
    const post = seleniumJavaAdapter.postProcess!
    expect(post(files, { bdd: true }).map((f) => f.filename)).toEqual(['pom.xml'])
    expect(post(files).map((f) => f.filename)).toEqual(['testng.xml', 'pom.xml'])
  })
})
