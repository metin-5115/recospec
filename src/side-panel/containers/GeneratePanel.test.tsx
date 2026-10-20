import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { GeneratePanel } from './GeneratePanel'
import { useSessionStore } from '../sessionStore'
import { makeSession, makeStep, resetUiHarness } from '../hooks/ui-message-harness.test-util'

vi.mock('@storage/session-repo', () => ({ listSessions: vi.fn(async () => []) }))
vi.mock('@storage/action-repo', () => ({ getActionsBySession: vi.fn(async () => []) }))

const onGenerate = vi.fn()
const onExportJson = vi.fn()

function renderPanel(): void {
  render(
    <GeneratePanel
      methodRenames={{}}
      onRenameMethod={vi.fn()}
      testData={{ params: [] }}
      onTestDataChange={vi.fn()}
      onGenerate={onGenerate}
      onExportJson={onExportJson}
    />,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  resetUiHarness()
  useSessionStore.setState({
    activeSession: makeSession('stopped'),
    steps: [makeStep('a')],
    codeGenError: null,
  })
  onGenerate.mockClear()
  onExportJson.mockClear()
})
afterEach(cleanup)

describe('GeneratePanel', () => {
  it('shows the common path — framework and Generate — without opening anything', () => {
    renderPanel()
    expect(screen.getByRole('tablist', { name: 'Output framework' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Generate/ }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('keeps the CLI export, Claude prompt, local LLM context and options behind Advanced', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: 'Export JSON for CLI' })).toBeNull()
    expect(screen.queryByText('Claude prompt')).toBeNull()
    expect(screen.queryByText('Local LLM context')).toBeNull()
    expect(screen.queryByLabelText('Auto-detect waits')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /advanced/i }))

    expect(screen.getByRole('button', { name: 'Export JSON for CLI' })).toBeTruthy()
    expect(screen.getByText('Claude prompt')).toBeTruthy()
    expect(screen.getByText('Local LLM context')).toBeTruthy()
    expect(screen.getByLabelText('Auto-detect waits')).toBeTruthy()
  })

  it('exports the session JSON from inside Advanced', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON for CLI' }))
    expect(onExportJson).toHaveBeenCalledWith('s1')
  })

  it('keeps a generation error visible while Advanced is closed', () => {
    useSessionStore.setState({ codeGenError: 'Nothing to generate' })
    renderPanel()
    expect(screen.getByText('Nothing to generate')).toBeTruthy()
  })
})
