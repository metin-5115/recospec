import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RECORDING_FLAG_STORAGE_KEY } from './constants'
import {
  allowContentScriptsToReadRecordingFlag,
  readRecordingFlag,
  writeRecordingFlag,
} from './recording-flag'

interface SessionArea {
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  setAccessLevel: ReturnType<typeof vi.fn>
}

let area: SessionArea
let stored: Record<string, unknown>

function installChrome(session: Partial<SessionArea> | undefined): void {
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    storage: session === undefined ? {} : { session },
  }
}

beforeEach(() => {
  stored = {}
  area = {
    get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(stored, items)
    }),
    setAccessLevel: vi.fn(async () => undefined),
  }
  installChrome(area)
})

describe('recording flag mirror', () => {
  it('is written to chrome.storage.session under one key', async () => {
    await writeRecordingFlag(true)
    expect(area.set).toHaveBeenCalledWith({ [RECORDING_FLAG_STORAGE_KEY]: true })
    await writeRecordingFlag(false)
    expect(stored[RECORDING_FLAG_STORAGE_KEY]).toBe(false)
  })

  it('reads back what was written', async () => {
    expect(await readRecordingFlag()).toBe(false)
    await writeRecordingFlag(true)
    expect(await readRecordingFlag()).toBe(true)
  })

  it('opens the area to content scripts', async () => {
    await allowContentScriptsToReadRecordingFlag()
    expect(area.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    })
  })

  it('never throws when the storage area is unavailable', async () => {
    installChrome(undefined)
    await expect(writeRecordingFlag(true)).resolves.toBeUndefined()
    await expect(allowContentScriptsToReadRecordingFlag()).resolves.toBeUndefined()
  })

  it('reads as "recording" when the flag cannot be read, so a recording is never missed', async () => {
    installChrome(undefined)
    expect(await readRecordingFlag()).toBe(true)
    area.get.mockRejectedValue(new Error('denied'))
    installChrome(area)
    expect(await readRecordingFlag()).toBe(true)
  })
})
