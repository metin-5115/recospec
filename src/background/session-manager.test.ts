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

describe('service-worker wake-up race', () => {
  // A message that wakes the worker reaches its handler while the module-level
  // active session is still being restored from Dexie. Each test uses a fresh
  // module (null active session) and holds the restore open on a deferred
  // promise to reproduce that window.
  type Manager = typeof import('./session-manager')
  type Repo = typeof import('@storage/session-repo')

  let manager: Manager
  let repo: Repo
  let releaseRestore: (sessions: Session[]) => void

  beforeEach(async () => {
    installChrome()
    vi.clearAllMocks()
    vi.resetModules()
    manager = await import('./session-manager')
    repo = await import('@storage/session-repo')
    vi.mocked(repo.listSessionsByState).mockImplementation(
      () =>
        new Promise<Session[]>((resolve) => {
          releaseRestore = resolve
        }),
    )
  })

  it('stopSession waits for the restore instead of ignoring the request', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session('stopped'))
    void manager.restoreActiveSession()

    const stopping = manager.stopSession('s1')
    releaseRestore([session('recording')])
    await stopping

    expect(repo.updateSession).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ state: 'stopped' }),
    )
    expect(tabMessages).toContainEqual({
      tabId: 7,
      msg: { type: 'STOP_CAPTURE', sessionId: 's1' },
    })
    expect(manager.getActiveSessionId()).toBeNull()
  })

  it('pauseSession waits for the restore instead of ignoring the request', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session('paused'))
    void manager.restoreActiveSession()

    const pausing = manager.pauseSession('s1')
    releaseRestore([session('recording')])
    await pausing

    expect(repo.updateSession).toHaveBeenCalledWith('s1', { state: 'paused' })
  })

  it('resumeSession waits for the restore instead of ignoring the request', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session('paused'))
    void manager.restoreActiveSession()

    const resuming = manager.resumeSession('s1')
    releaseRestore([session('paused')])
    await resuming

    expect(repo.updateSession).toHaveBeenCalledWith('s1', { state: 'recording' })
    expect(tabMessages).toContainEqual(
      expect.objectContaining({
        tabId: 7,
        msg: expect.objectContaining({ type: 'START_CAPTURE' }),
      }),
    )
  })

  it('resumeCaptureOnReady waits for the restore so a navigation keeps recording', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session('recording'))
    void manager.restoreActiveSession()

    const resuming = manager.resumeCaptureOnReady(7)
    releaseRestore([session('recording')])
    await resuming

    expect(tabMessages).toHaveLength(1)
    expect(tabMessages[0]).toMatchObject({ tabId: 7, msg: { type: 'START_CAPTURE' } })
  })

  it('starts the restore itself when no one has kicked it off yet', async () => {
    vi.mocked(repo.getSession).mockResolvedValue(session('paused'))

    const pausing = manager.pauseSession('s1')
    await vi.waitFor(() => expect(repo.listSessionsByState).toHaveBeenCalledTimes(1))
    releaseRestore([session('recording')])
    await pausing

    expect(repo.updateSession).toHaveBeenCalledWith('s1', { state: 'paused' })
  })

  it('still handles requests when the restore itself fails', async () => {
    vi.mocked(repo.listSessionsByState).mockRejectedValue(new Error('idb unavailable'))

    await expect(manager.pauseSession('s1')).resolves.toBeUndefined()
    expect(repo.updateSession).not.toHaveBeenCalled()
  })

  it('whenSessionRestored resolves only once the active tab is known', async () => {
    void manager.restoreActiveSession()

    const tab = manager.whenSessionRestored().then(() => manager.getActiveTabId())
    releaseRestore([session('recording', 11)])

    await expect(tab).resolves.toBe(11)
  })
})
