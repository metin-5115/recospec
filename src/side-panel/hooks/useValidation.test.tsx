import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useSessionStore } from '../sessionStore'
import { useValidation } from './useValidation'
import { broadcast, makeSession, makeStep, resetUiHarness } from './ui-message-harness.test-util'
import type { RecordedAction } from '@shared/types/action'
import type { LocatorValidationResult } from '@shared/types/messages'

vi.mock('@storage/session-repo', () => ({ listSessions: vi.fn(async () => []) }))
vi.mock('@storage/action-repo', () => ({ getActionsBySession: vi.fn(async () => []) }))

function sent(): Array<Record<string, unknown>> {
  const fn = (
    globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }
  ).chrome.runtime.sendMessage
  return fn.mock.calls.map((c) => c[0] as Record<string, unknown>)
}

function stepWithTarget(id: string, text: string): RecordedAction {
  return {
    ...makeStep(id),
    target: {
      primaryLocator: { strategy: 'css', value: `#${id}` },
      fallbackLocators: [{ strategy: 'xpath', value: `//*[@id="${id}"]` }],
      elementSnapshot: { tagName: 'button', textContent: text },
    },
  } as unknown as RecordedAction
}

function resultFor(actionId: string, matched: boolean): LocatorValidationResult {
  return {
    actionId,
    index: 0,
    label: actionId,
    primary: { status: matched ? 'matched' : 'missing' },
    fallbacks: [],
  } as unknown as LocatorValidationResult
}

beforeEach(() => {
  resetUiHarness()
  useSessionStore.setState({ activeSession: makeSession('stopped'), steps: [] })
})

afterEach(cleanup)

describe('useValidation', () => {
  it('explains itself when no step has a captured locator', async () => {
    useSessionStore.setState({ steps: [makeStep('a')] })
    const { result } = renderHook(() => useValidation())
    await act(async () => {
      await result.current.validateLocators()
    })
    expect(result.current.validationError).toMatch(/No steps with captured locators/)
    expect(result.current.isValidating).toBe(false)
    expect(sent()).toEqual([])
  })

  it('sends one target per step with a locator and waits for the result', async () => {
    useSessionStore.setState({ steps: [makeStep('a'), stepWithTarget('b', '  Save  ')] })
    const { result } = renderHook(() => useValidation())
    await act(async () => {
      await result.current.validateLocators()
    })
    expect(result.current.isValidating).toBe(true)
    const message = sent()[0] as { type: string; recordedUrl: string; targets: unknown[] }
    expect(message.type).toBe('VALIDATE_LOCATORS')
    expect(message.recordedUrl).toBe('https://example.com')
    expect(message.targets).toMatchObject([{ actionId: 'b', index: 1, label: 'Save' }])
  })

  it('stores the result, duration and stats when the background answers', () => {
    const { result } = renderHook(() => useValidation())
    broadcast({
      type: 'LOCATOR_VALIDATION_RESULT',
      sessionId: 's1',
      results: [resultFor('a', true), resultFor('b', false)],
      durationMs: 42,
      pageUrl: 'https://example.com',
    })
    expect(result.current.validationDurationMs).toBe(42)
    expect(result.current.validationStats).toEqual({ matched: 1, total: 2 })
    expect(result.current.isValidating).toBe(false)
  })

  it('surfaces a validation error from the background', () => {
    const { result } = renderHook(() => useValidation())
    broadcast({
      type: 'LOCATOR_VALIDATION_RESULT',
      sessionId: 's1',
      results: [],
      durationMs: 0,
      pageUrl: '',
      error: 'no content script',
    })
    expect(result.current.validationError).toBe('no content script')
  })

  it('asks the page to highlight the primary locator of a result', async () => {
    useSessionStore.setState({ steps: [stepWithTarget('b', 'Save')] })
    const { result } = renderHook(() => useValidation())
    await act(async () => {
      await result.current.showLocatorOnPage(resultFor('b', true))
    })
    expect(sent()[0]).toMatchObject({
      type: 'HIGHLIGHT_LOCATOR',
      locator: { strategy: 'css', value: '#b' },
      label: 'b',
    })
  })

  it('does nothing for a result whose step has no target', async () => {
    useSessionStore.setState({ steps: [makeStep('a')] })
    const { result } = renderHook(() => useValidation())
    await act(async () => {
      await result.current.showLocatorOnPage(resultFor('a', true))
      await result.current.useFallbackLocator(resultFor('a', true), 0)
    })
    expect(sent()).toEqual([])
  })
})
