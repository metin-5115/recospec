import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { PromptPreview } from './PromptPreview'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'

afterEach(cleanup)

const session: Session = {
  sessionId: 'session-1',
  name: 'Login Flow',
  state: 'stopped',
  startUrl: 'https://example.com/login',
  startedAt: 1,
  stoppedAt: 2,
  metadata: { userAgent: 'test', viewport: { width: 1280, height: 800 }, timezone: 'UTC' },
  config: { captureClicks: true, captureInputs: true, captureNavigation: true },
  iterationNumber: 1,
  flowSignature: 'sig',
}

function fill(idx: number, label: string, value: string, type: string): RecordedAction {
  return {
    actionId: `a${idx}`,
    sessionId: 'session-1',
    sequenceNumber: idx,
    type: 'fill',
    timestamp: idx,
    pageUrl: 'https://example.com/login',
    target: {
      primaryLocator: {
        strategy: 'aria-label',
        selector: `[aria-label="${label}"]`,
        framework: {},
        score: 100,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: {
        tagName: 'input',
        attributes: { type, name: label.toLowerCase(), 'aria-label': label },
        textContent: '',
      },
    },
    payload: { value },
  }
}

const steps = [
  fill(0, 'Email', 'alice@example.com', 'email'),
  fill(1, 'Password', 'supersecret123', 'password'),
]

describe('PromptPreview', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('is collapsed by default and renders nothing until expanded', () => {
    render(<PromptPreview session={session} steps={steps} framework="playwright-ts" />)
    expect(screen.queryByLabelText('Prompt preview')).toBeNull()
  })

  it('shows a redacted XML prompt when expanded', () => {
    render(<PromptPreview session={session} steps={steps} framework="playwright-ts" />)
    fireEvent.click(screen.getByRole('button', { name: /claude prompt/i }))
    const preview = screen.getByLabelText('Prompt preview')
    expect(preview.textContent).toContain('<recospec_prompt flow="login-flow"')
    expect(preview.textContent).toContain('[REDACTED:RECOSPEC_PASSWORD]')
    expect(preview.textContent).not.toContain('supersecret123')
  })

  it('reveals raw values and warns when redaction is switched off', () => {
    render(<PromptPreview session={session} steps={steps} framework="playwright-ts" />)
    fireEvent.click(screen.getByRole('button', { name: /claude prompt/i }))
    fireEvent.click(screen.getByLabelText('Redact sensitive values'))
    expect(screen.getByLabelText('Prompt preview').textContent).toContain('supersecret123')
    expect(screen.getByRole('alert').textContent).toContain('Redaction is off')
  })

  it('copies the rendered prompt to the clipboard', async () => {
    render(<PromptPreview session={session} steps={steps} framework="cypress" />)
    fireEvent.click(screen.getByRole('button', { name: /claude prompt/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1))
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0] ?? ''
    expect(copied).toContain('cypress/e2e/login-flow.cy.js')
  })

  it('downloads the prompt as <slug>.prompt.md', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:prompt')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<PromptPreview session={session} steps={steps} framework="playwright-ts" />)
    fireEvent.click(screen.getByRole('button', { name: /claude prompt/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Download prompt' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:prompt')
    click.mockRestore()
  })
})
