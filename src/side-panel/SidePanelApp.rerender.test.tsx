import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

vi.mock('@storage/session-repo', () => ({ listSessions: vi.fn(async () => []) }))
vi.mock('@storage/action-repo', () => ({ getActionsBySession: vi.fn(async () => []) }))

const renders = vi.hoisted(() => ({ header: 0, generate: 0, history: 0, generated: 0 }))

// Counting stand-ins for the containers that must NOT follow every new step.
vi.mock('./containers/RecordingHeader', () => ({
  RecordingHeader: () => {
    renders.header += 1
    return null
  },
}))
vi.mock('./containers/GeneratePanel', () => ({
  GeneratePanel: () => {
    renders.generate += 1
    return null
  },
}))
vi.mock('./containers/HistoryTab', () => ({
  HistoryTab: () => {
    renders.history += 1
    return null
  },
}))
vi.mock('./containers/GeneratedCodeSection', () => ({
  GeneratedCodeSection: () => {
    renders.generated += 1
    return null
  },
}))

import { SidePanelApp } from './SidePanelApp'
import { useSessionStore } from './sessionStore'
import { makeSession, makeStep, resetUiHarness } from './hooks/ui-message-harness.test-util'

beforeEach(() => {
  resetUiHarness()
  renders.header = renders.generate = renders.history = renders.generated = 0
})
afterEach(cleanup)

function appendStep(id: string): void {
  act(() => useSessionStore.getState().appendStep(makeStep(id)))
}

describe('SidePanelApp — appending a step', () => {
  it('leaves the header, Generate panel, generated code and history alone while recording', () => {
    useSessionStore.setState({
      activeSession: makeSession('recording'),
      steps: [makeStep('a0')],
      generatedCode: { framework: 'playwright-ts', files: [] },
    })
    render(<SidePanelApp />)
    const before = { ...renders }

    appendStep('a1')
    appendStep('a2')

    expect(renders).toEqual(before)
  })

  it('does not re-render the Generate panel when a step is added to a stopped recording either', () => {
    useSessionStore.setState({
      activeSession: makeSession('stopped'),
      steps: [makeStep('a0')],
    })
    render(<SidePanelApp />)
    expect(renders.generate).toBe(1)

    appendStep('a1')

    // The panel mounts once; the shell does not re-render it for a step it did not ask for.
    expect(renders.generate).toBe(1)
  })
})
