import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useSessionStore } from '../sessionStore'
import { useCodegen } from './useCodegen'
import { makeSession, resetUiHarness } from './ui-message-harness.test-util'
import { CODEGEN_MAX_ATTEMPTS, CODEGEN_RETRY_DELAY_MS } from '@shared/constants'

vi.mock('@storage/session-repo', () => ({ listSessions: vi.fn(async () => []) }))
vi.mock('@storage/action-repo', () => ({ getActionsBySession: vi.fn(async () => []) }))

function sendMessageMock(): ReturnType<typeof vi.fn> {
  return (
    globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }
  ).chrome.runtime.sendMessage
}

async function runGenerateCode(): Promise<void> {
  const { result } = renderHook(() => useCodegen())
  await act(async () => {
    const pending = result.current.generateCode()
    await vi.advanceTimersByTimeAsync(CODEGEN_RETRY_DELAY_MS * CODEGEN_MAX_ATTEMPTS)
    await pending
  })
}

beforeEach(() => {
  resetUiHarness()
  useSessionStore.setState({ activeSession: makeSession('stopped'), codeGenError: null })
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useCodegen.generateCode options', () => {
  it('asks for the final-state assertion unless the user turned it off', async () => {
    await runGenerateCode()
    expect(sendMessageMock().mock.calls[0]?.[0]).toMatchObject({
      options: { finalStateAssertion: true },
    })

    useSessionStore.setState({ finalStateAssertion: false })
    sendMessageMock().mockClear()
    await runGenerateCode()
    expect(sendMessageMock().mock.calls[0]?.[0]).toMatchObject({
      options: { finalStateAssertion: false },
    })
  })
})

describe('useCodegen.generateCode self-healing option', () => {
  it('sends the runtime self-healing choice', async () => {
    await runGenerateCode()
    expect(sendMessageMock().mock.calls[0]?.[0]).toMatchObject({ options: { selfHealing: true } })
    useSessionStore.setState({ selfHealing: false })
    sendMessageMock().mockClear()
    await runGenerateCode()
    expect(sendMessageMock().mock.calls[0]?.[0]).toMatchObject({ options: { selfHealing: false } })
  })
})

describe('useCodegen.generateCode retry', () => {
  it('retries when the background worker is not reachable yet', async () => {
    sendMessageMock()
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
    await runGenerateCode()
    expect(sendMessageMock()).toHaveBeenCalledTimes(3)
    expect(useSessionStore.getState().codeGenError).toBeNull()
  })

  it('reports an error after the last attempt fails', async () => {
    sendMessageMock().mockRejectedValue(new Error('Receiving end does not exist'))
    await runGenerateCode()
    expect(sendMessageMock()).toHaveBeenCalledTimes(CODEGEN_MAX_ATTEMPTS)
    expect(useSessionStore.getState().codeGenError).toContain('Failed to reach background worker')
  })
})
