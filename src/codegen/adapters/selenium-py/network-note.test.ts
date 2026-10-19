import { describe, it, expect } from 'vitest'
import { renderScenario } from './scenario'
import { validatePythonSource } from './python-validate'
import type { IRElement, IRPage, IRScenario, IRStep } from '../../ir/types'

const submit: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="submit"]',
  tagName: 'button',
}

const steps: IRStep[] = [
  { id: 'c', action: 'click', element: submit },
  {
    id: 'n1',
    action: 'network',
    network: { method: 'post', url: 'https://api.example.com/api/login?x=1', status: 201 },
  },
  {
    id: 'n2',
    action: 'network',
    network: { method: 'post', url: 'https://api.example.com/api/login?x=1', status: 201 },
  },
]

const scenario: IRScenario = {
  name: 'Login',
  pages: [
    {
      name: 'Login',
      className: 'LoginPage',
      normalizedUrl: '/login',
      elements: [submit],
      steps,
    } as IRPage,
  ],
}

describe('selenium-py — network mock note', () => {
  it('stays silent when mocks were not requested', () => {
    expect(renderScenario(scenario)).not.toContain('Not mocked')
  })

  it('lists the captured requests once when mocks were requested', () => {
    const out = renderScenario(scenario, { includeMocks: true })
    expect(out).toContain('# Not mocked')
    expect(out.match(/POST \/api\/login\?x=1 -> 201/g)).toHaveLength(1)
    expect(validatePythonSource(out).ok).toBe(true)
  })

  it('adds nothing when no request was captured', () => {
    const quiet: IRScenario = {
      name: 'Quiet',
      pages: [{ ...scenario.pages[0], steps: [steps[0]] }],
    }
    expect(renderScenario(quiet, { includeMocks: true })).not.toContain('Not mocked')
  })
})
