/**
 * Page-origin localStorage flags: the only SYNCHRONOUS channel between the ISOLATED
 * content script and the MAIN-world proxies. Every access is guarded because pages can
 * sandbox or block storage — a flag that cannot be read is simply OFF.
 *
 * The MAIN-world proxies ask for a flag on every request, so each world keeps the value in
 * memory. localStorage is read once per key; later changes reach the other world through a
 * window event (both worlds share the page's DOM events), not through another storage read.
 */
import { PAGE_FLAG_EVENT_NAME } from '@shared/constants'

interface PageFlagChange {
  key: string
  on: boolean
}

const cache = new Map<string, boolean>()
let isListening = false

function listenForChanges(): void {
  if (isListening) return
  isListening = true
  window.addEventListener(PAGE_FLAG_EVENT_NAME, (event) => {
    const change = (event as CustomEvent<Partial<PageFlagChange> | null>).detail
    if (change && typeof change.key === 'string') cache.set(change.key, change.on === true)
  })
}

export function setPageFlag(key: string, on: boolean): void {
  listenForChanges()
  cache.set(key, on)
  try {
    if (on) window.localStorage.setItem(key, 'true')
    else window.localStorage.removeItem(key)
  } catch {
    /* sandboxed localStorage — the flag only lives in memory */
  }
  const change: PageFlagChange = { key, on }
  window.dispatchEvent(new CustomEvent(PAGE_FLAG_EVENT_NAME, { detail: change }))
}

export function isPageFlagSet(key: string): boolean {
  listenForChanges()
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  let stored: boolean
  try {
    stored = window.localStorage.getItem(key) === 'true'
  } catch {
    stored = false
  }
  cache.set(key, stored)
  return stored
}
