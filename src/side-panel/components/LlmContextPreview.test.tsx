import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { LlmContextPreview } from './LlmContextPreview'
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
      fallbackLocators: [
        { strategy: 'label', selector: label, framework: {}, score: 80, matchCount: 1 },
      ],
      elementSnapshot: {
        tagName: 'input',
        attributes: { type, name: label.toLowerCase(), 'aria-label': label },
        textContent: '',
      },
      fingerprint: {
        tag: 'input',
        attributes: { type, name: label.toLowerCase() },
        role: null,
        accessibleName: label,
        neighborTexts: ['Sign in'],
        domPath: 'body>main>form>input',
        boundingBoxRatio: { x: 0.5, y: 0.25 },
      },
    },
    payload: { value },
  }
}

const steps = [
  fill(0, 'Email', 'alice@example.com', 'email'),
  fill(1, 'Password', 'supersecret123', 'password'),
]

const open = () => fireEvent.click(screen.getByRole('button', { name: /local llm context/i }))

describe('LlmContextPreview', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('is collapsed by default and renders nothing until expanded', () => {
    render(<LlmContextPreview session={session} steps={steps} framework="playwright-ts" />)
    expect(screen.queryByLabelText('LLM context preview')).toBeNull()
  })

  it('shows a redacted compact context with a token estimate when expanded', () => {
    render(<LlmContextPreview session={session} steps={steps} framework="playwright-ts" />)
    open()
    const preview = screen.getByLabelText('LLM context preview')
    expect(preview.textContent).toContain('#recospec-ctx v1 flow=login-flow')
    expect(preview.textContent).toContain('$RECOSPEC_PASSWORD')
    expect(preview.textContent).not.toContain('supersecret123')
    expect(screen.getByLabelText('Context size').textContent).toMatch(/~\d+ tokens/)
  })

  it('switches to minified JSON', () => {
    render(<LlmContextPreview session={session} steps={steps} framework="playwright-ts" />)
    open()
    fireEvent.change(screen.getByLabelText('Context format'), { target: { value: 'json' } })
    const text = screen.getByLabelText('LLM context preview').textContent ?? ''
    expect(JSON.parse(text)).toMatchObject({ v: 1, flow: 'login-flow' })
  })

  it('drops healing sections when the task is code generation only', () => {
    render(<LlmContextPreview session={session} steps={steps} framework="playwright-ts" />)
    open()
    expect(screen.getByLabelText('LLM context preview').textContent).toContain('@fp')
    fireEvent.change(screen.getByLabelText('Context task'), { target: { value: 'codegen' } })
    const text = screen.getByLabelText('LLM context preview').textContent ?? ''
    expect(text).not.toContain('@fp')
    expect(text).not.toContain(' ~ label:')
  })

  it('reveals raw values and warns when redaction is switched off', () => {
    render(<LlmContextPreview session={session} steps={steps} framework="playwright-ts" />)
    open()
    fireEvent.click(screen.getByLabelText('Redact sensitive values'))
    expect(screen.getByLabelText('LLM context preview').textContent).toContain('supersecret123')
    expect(screen.getByRole('alert').textContent).toContain('Redaction is off')
  })

  it('copies the rendered context to the clipboard', async () => {
    render(<LlmContextPreview session={session} steps={steps} framework="playwright-ts" />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Copy LLM context' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1))
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0] ?? ''
    expect(copied).toContain('@steps')
  })

  it('downloads the context as <slug>.llm.txt', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:ctx')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<LlmContextPreview session={session} steps={steps} framework="playwright-ts" />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Download LLM context' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ctx')
    click.mockRestore()
  })
})
