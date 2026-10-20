import { vi } from 'vitest'

/**
 * A shared stand-in for the parts of `chrome.*` the extension uses, installed on `globalThis`.
 * Tests ask for what they need from the returned handles instead of hand-rolling the same object.
 */
export interface ChromeMock {
  runtimeSendMessage: ReturnType<typeof vi.fn>
  tabsSendMessage: ReturnType<typeof vi.fn>
  tabsGet: ReturnType<typeof vi.fn>
  captureVisibleTab: ReturnType<typeof vi.fn>
  executeScript: ReturnType<typeof vi.fn>
  setBadgeText: ReturnType<typeof vi.fn>
  setBadgeBackgroundColor: ReturnType<typeof vi.fn>
  alarmsClear: ReturnType<typeof vi.fn>
  alarmsCreate: ReturnType<typeof vi.fn>
  /** Contents of `chrome.storage.session`. */
  sessionStorage: Record<string, unknown>
  sessionSetAccessLevel: ReturnType<typeof vi.fn>
}

export function installChromeMock(): ChromeMock {
  const sessionStorage: Record<string, unknown> = {}
  const mock: ChromeMock = {
    runtimeSendMessage: vi.fn(async () => undefined),
    tabsSendMessage: vi.fn(async () => undefined),
    tabsGet: vi.fn(async (id: number) => ({ id, url: 'https://example.com/' })),
    captureVisibleTab: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
    executeScript: vi.fn(async () => undefined),
    setBadgeText: vi.fn(async () => undefined),
    setBadgeBackgroundColor: vi.fn(async () => undefined),
    alarmsClear: vi.fn(async () => true),
    alarmsCreate: vi.fn(async () => undefined),
    sessionStorage,
    sessionSetAccessLevel: vi.fn(async () => undefined),
  }
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: mock.runtimeSendMessage },
    tabs: {
      sendMessage: mock.tabsSendMessage,
      get: mock.tabsGet,
      captureVisibleTab: mock.captureVisibleTab,
    },
    scripting: { executeScript: mock.executeScript },
    action: {
      setBadgeText: mock.setBadgeText,
      setBadgeBackgroundColor: mock.setBadgeBackgroundColor,
    },
    alarms: { clear: mock.alarmsClear, create: mock.alarmsCreate },
    storage: {
      session: {
        get: vi.fn(async (key: string) => ({ [key]: sessionStorage[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(sessionStorage, items)
        }),
        setAccessLevel: mock.sessionSetAccessLevel,
      },
    },
  }
  return mock
}
