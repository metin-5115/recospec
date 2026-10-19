import { logger } from '@shared/logger'

/**
 * UI preferences only (no recorded data). localStorage is used deliberately: the store needs them
 * synchronously to build its initial state, which an async IndexedDB read cannot provide without
 * a flash of default values. Every access is guarded; recordings themselves live in Dexie.
 */

/** Reads a stored preference. `guard` validates the parsed JSON; anything invalid falls back. */
export function readPref<T>(key: string, guard: (value: unknown) => value is T, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key)
    if (stored === null) return fallback
    // Booleans and objects are JSON; the framework id was always stored as a bare string.
    let parsed: unknown
    try {
      parsed = JSON.parse(stored)
    } catch {
      parsed = stored
    }
    return guard(parsed) ? parsed : fallback
  } catch {
    // localStorage is unavailable in some contexts (and the stored text may be malformed).
    return fallback
  }
}

/** Stores a preference. A failed write (quota, disabled storage) costs only persistence. */
export function writePref(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  } catch (err) {
    logger.debug('[UI] Could not persist a preference', key, err)
  }
}

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
