import { RECORDING_FLAG_STORAGE_KEY } from './constants'
import { logger } from './logger'

/**
 * A mirror of "a recording is active", kept in `chrome.storage.session` so a freshly injected
 * content script can find out without waking the service worker. The source of truth stays in
 * Dexie; nothing but this one boolean lives here.
 */

function sessionArea(): chrome.storage.SessionStorageArea | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.storage?.session
}

/** Service worker: publish whether a recording is active. Never throws. */
export async function writeRecordingFlag(active: boolean): Promise<void> {
  try {
    await sessionArea()?.set({ [RECORDING_FLAG_STORAGE_KEY]: active })
  } catch (err) {
    logger.warn('[BG] Could not mirror the recording flag', err)
  }
}

/**
 * Service worker, on every start: `chrome.storage.session` is hidden from content scripts unless
 * the extension opens it. Never throws.
 */
export async function allowContentScriptsToReadRecordingFlag(): Promise<void> {
  try {
    await sessionArea()?.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
  } catch (err) {
    logger.warn('[BG] Could not open chrome.storage.session to content scripts', err)
  }
}

/**
 * Content script: is a recording active? Fails open — when the flag cannot be read, say yes, so
 * a recording is never missed because of a storage problem (the cost is one wake-up).
 */
export async function readRecordingFlag(): Promise<boolean> {
  const area = sessionArea()
  if (!area) return true
  try {
    const stored = await area.get(RECORDING_FLAG_STORAGE_KEY)
    return stored[RECORDING_FLAG_STORAGE_KEY] === true
  } catch {
    return true
  }
}
