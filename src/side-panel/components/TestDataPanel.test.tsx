import { describe, it, expect, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { TestDataPanel } from './TestDataPanel'
import type { ActionType, RecordedAction } from '@shared/types/action'
import type { TestDataConfig } from '@codegen/ir/types'

afterEach(cleanup)

const LOGIN_URL = 'https://shop.test/login'

function action(
  type: ActionType,
  testId: string,
  attributes: Record<string, string> = {},
  payload?: Record<string, unknown>,
): RecordedAction {
  return {
    actionId: testId,
    sessionId: 's1',
    sequenceNumber: 0,
    type,
    timestamp: 0,
    pageUrl: LOGIN_URL,
    payload,
    target: {
      primaryLocator: {
        strategy: 'testid',
        selector: `[data-testid="${testId}"]`,
        framework: {},
        score: 95,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: {
        tagName: type === 'click' ? 'button' : 'input',
        attributes: { 'data-testid': testId, ...attributes },
        textContent: '',
      },
    },
  }
}

const failedLogin: RecordedAction[] = [
  action('fill', 'email', { type: 'email' }, { value: 'ada@example.com' }),
  action('fill', 'password', { type: 'password' }, { value: 'wrong-pass' }),
  action('click', 'sign-in'),
  action('assert', 'login-error', {}, { assertionType: 'text', expected: 'Invalid credentials' }),
]

function Harness({ steps }: { steps: RecordedAction[] }) {
  const [testData, setTestData] = useState<TestDataConfig>({ params: [] })
  return (
    <TestDataPanel steps={steps} startUrl={LOGIN_URL} testData={testData} onChange={setTestData} />
  )
}

describe('TestDataPanel — failed login', () => {
  it('lists the invalid-password variable instead of the regular one', () => {
    render(<Harness steps={failedLogin} />)
    expect(screen.getByText('RECOSPEC_PASSWORD_INVALID')).toBeTruthy()
    expect(screen.getByText('RECOSPEC_EMAIL')).toBeTruthy()
    expect(screen.queryByText('RECOSPEC_PASSWORD')).toBeNull()
  })

  it('never shows the recorded password', () => {
    const { container } = render(<Harness steps={failedLogin} />)
    expect(container.innerHTML).not.toContain('wrong-pass')
  })
})
