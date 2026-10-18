/**
 * Page-origin localStorage flags: the only SYNCHRONOUS channel between the ISOLATED
 * content script and the MAIN-world proxies. Every access is guarded because pages can
 * sandbox or block storage — a flag that cannot be read is simply OFF.
 */

export function setPageFlag(key: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(key, 'true')
    else window.localStorage.removeItem(key)
  } catch {
    /* sandboxed localStorage — the flag stays off */
  }
}

export function isPageFlagSet(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}
