import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Session } from '@shared/types/session'

// The storage layer is Dexie-backed; mock it so the manager's in-memory active
// session can be primed without IndexedDB.
vi.mock('@storage/session-repo', () => ({
  createSession: vi.fn(async () => undefined),
  updateSession: vi.fn(async () => undefined),
  getSession: vi.fn(),
  listSessionsByState: vi.fn(async () => []),
  deleteSession: vi.fn(async () => undefined),
}))

import { restoreActiveSession, resumeCaptureOnReady } from './session-manager'
import { getSession, listSessionsByState } from '@storage/session-repo'

const tabMessages: { tabId: number; msg: { type: string; sessionId?: string } }[] = []

function installChrome(): void {
  tabMessages.length = 0
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    tabs: {
      sendMessage: vi.fn(async (tabId: number, msg: { type: string }) => {
        tabMessages.push({ tabId, msg })
      }),
    },
    runtime: { sendMessage: vi.fn(async () => undefined) },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
    },
  }
}

function session(state: Session['state'], tabId = 7): Session {
  return {
    sessionId: 's1',
    name: 'rec',
    state,
    startUrl: 'https://app.test/a',
    startedAt: 0,
    tabId,
    metadata: {} as Session['metadata'],
    config: {} as Session['config'],
    iterationNumber: 1,
    flowSignature: 'sig',
  }
}

describe('resumeCaptureOnReady (recording survives navigation)', () => {
  beforeEach(async () => {
    installChrome()
    vi.mocked(listSessionsByState).mockResolvedValue([session('recording')])
    // Prime the manager's active session (tab 7) from the mocked store.
    await restoreActiveSession()
  })

  it('re-sends START_CAPTURE when the owning tab reloads mid-recording', async () => {
    vi.mocked(getSession).mockResolvedValue(session('recording'))

    await resumeCaptureOnReady(7)

    expect(tabMessages).toHaveLength(1)
    expect(tabMessages[0]).toMatchObject({
      tabId: 7,
      msg: { type: 'START_CAPTURE', sessionId: 's1' },
    })
  })

  it('does nothing for a tab that does not own the active session', async () => {
    vi.mocked(getSession).mockResolvedValue(session('recording'))

    await resumeCaptureOnReady(999)

    expect(tabMessages).toHaveLength(0)
  })

  it('does not resume when the session is paused', async () => {
    vi.mocked(getSession).mockResolvedValue(session('paused'))

    await resumeCaptureOnReady(7)

    expect(tabMessages).toHaveLength(0)
  })
})
