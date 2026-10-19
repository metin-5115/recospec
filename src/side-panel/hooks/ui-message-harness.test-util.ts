import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { BackgroundToUIMessage } from '@shared/types/messages'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'
import { useSessionStore } from '../sessionStore'

type ChromeListener = (message: BackgroundToUIMessage, sender: object, respond: () => void) => void

let listeners: Array<(message: BackgroundToUIMessage) => void> = []

/**
 * Test-only: stand in for `chrome.runtime` so hooks can register UI-message
 * listeners, and reset the session store to a known baseline.
 */
export function resetUiHarness(): void {
  listeners = []
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: {
        addListener: (fn: ChromeListener) => {
          listeners.push((message) => fn(message, {}, () => undefined))
        },
        removeListener: () => undefined,
      },
    },
  }
  useSessionStore.setState({
    activeSession: null,
    steps: [],
    sessions: [],
    activeTab: 'recording',
    asyncError: null,
    includeMocks: false,
    finalStateAssertion: true,
    pierceClosedShadow: false,
  })
}

/** Deliver a background → UI message to every listener the mounted hooks registered. */
export function broadcast(message: BackgroundToUIMessage): void {
  act(() => {
    for (const listener of [...listeners]) listener(message)
  })
}

export function makeSession(state: Session['state']): Session {
  return {
    sessionId: 's1',
    name: 'Flow',
    state,
    startUrl: 'https://example.com',
    startedAt: 0,
    metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'sig',
  }
}

export function makeStep(id: string): RecordedAction {
  return {
    actionId: id,
    sessionId: 's1',
    sequenceNumber: 0,
    type: 'click',
    timestamp: 0,
    pageUrl: 'https://example.com',
  }
}
