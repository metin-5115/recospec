import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useAssertions } from './useAssertions'
import { broadcast, makeSession, resetUiHarness } from './ui-message-harness.test-util'
import { useSessionStore } from '../sessionStore'
import type { ElementRect } from '@shared/types/action'

vi.mock('@storage/session-repo', () => ({ listSessions: vi.fn(async () => []) }))
vi.mock('@storage/action-repo', () => ({ getActionsBySession: vi.fn(async () => []) }))

const RECT: ElementRect = { x: 10, y: 20, width: 100, height: 40, devicePixelRatio: 2 }

function sendMessageMock(): ReturnType<typeof vi.fn> {
  return (
    globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }
  ).chrome.runtime.sendMessage
}

function suggestionsMessage(elementRect?: ElementRect) {
  return {
    type: 'ASSERTION_SUGGESTIONS' as const,
    locatorBundle: null,
    elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Pay' },
    suggestions: [
      { type: 'visible' as const, label: 'Expect visible' },
      { type: 'screenshot' as const, label: 'Screenshot match', name: 'pay', threshold: 0.2 },
    ],
    pageMetadata: { url: 'https://shop.test/pay', title: 'Pay' },
    elementRect,
  }
}

beforeEach(() => {
  resetUiHarness()
  useSessionStore.setState({ activeSession: makeSession('recording') })
})
afterEach(cleanup)

describe('useAssertions — screenshot on demand', () => {
  it('opens the builder without a screenshot', () => {
    const { result } = renderHook(() => useAssertions())
    broadcast(suggestionsMessage(RECT))
    expect(result.current.assertionContext?.screenshotDataUrl).toBeUndefined()
    expect(result.current.assertionContext?.elementRect).toEqual(RECT)
  })

  it('asks for the thumbnail, with the element position, only when requested', () => {
    const { result } = renderHook(() => useAssertions())
    broadcast(suggestionsMessage(RECT))
    expect(sendMessageMock()).not.toHaveBeenCalled()

    act(() => result.current.requestThumbnail())

    expect(sendMessageMock()).toHaveBeenCalledWith({
      type: 'ASSERTION_THUMBNAIL_REQUEST',
      sessionId: 's1',
      elementRect: RECT,
    })
  })

  it('asks at most once per picked element', () => {
    const { result } = renderHook(() => useAssertions())
    broadcast(suggestionsMessage(RECT))
    act(() => result.current.requestThumbnail())
    act(() => result.current.requestThumbnail())
    expect(sendMessageMock()).toHaveBeenCalledTimes(1)
  })

  it('does not capture the tab for a builder opened from a stopped step (no live element)', () => {
    const { result } = renderHook(() => useAssertions())
    broadcast(suggestionsMessage(undefined))
    act(() => result.current.requestThumbnail())
    expect(sendMessageMock()).not.toHaveBeenCalled()
  })

  it('shows the thumbnail when it arrives', () => {
    const { result } = renderHook(() => useAssertions())
    broadcast(suggestionsMessage(RECT))
    broadcast({ type: 'ASSERTION_THUMBNAIL', dataUrl: 'data:image/jpeg;base64,AAAA' })
    expect(result.current.assertionContext?.screenshotDataUrl).toBe('data:image/jpeg;base64,AAAA')
  })
})
