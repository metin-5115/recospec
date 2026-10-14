/**
 * MAIN-world bootstrap for closed shadow-root piercing. Mirrors the
 * `network-proxy.ts` pattern: a second `content_scripts` entry with
 * `"world": "MAIN"` + `"run_at": "document_start"` lets this run in the page's
 * own JS context before any component calls `attachShadow`.
 *
 * Piercing is OFF by default and gated by a page-origin localStorage flag that
 * the ISOLATED content script mirrors from the extension preference. We read
 * localStorage here (not `chrome.storage`) because it is the only SYNCHRONOUS
 * cross-world channel available at `document_start`.
 *
 * ASSUMPTION: shadow roots attached during the very first paint after the user
 * ENABLES piercing may be missed (the flag is mirrored on page load, which is
 * after this script's document_start on that first navigation). Subsequent
 * navigations and SPA-attached roots are covered. This is acceptable for an
 * invasive, explicit opt-in.
 */
import { PIERCE_CLOSED_SHADOW_FLAG_KEY } from '@shared/constants'
import { installClosedShadowProxy } from './closed-shadow'

const PIERCED_ATTR = 'data-recospec-pierced'

function piercingEnabled(): boolean {
  try {
    return window.localStorage.getItem(PIERCE_CLOSED_SHADOW_FLAG_KEY) === 'true'
  } catch {
    // Some pages sandbox localStorage — fail safe to OFF.
    return false
  }
}

if (piercingEnabled()) {
  const handle = installClosedShadowProxy(Element.prototype, { pierce: true })

  // Re-wrap `attachShadow` once more to stamp the host so the ISOLATED-world
  // detector knows this open root was ORIGINALLY closed (→ "pierced" badge).
  const inner = Element.prototype.attachShadow
  Element.prototype.attachShadow = function stampingAttachShadow(
    this: Element,
    init: ShadowRootInit,
  ): ShadowRoot {
    const root = inner.call(this, init)
    if (init.mode === 'closed') {
      try {
        this.setAttribute(PIERCED_ATTR, '')
      } catch {
        /* read-only host — ignore */
      }
    }
    return root
  } as Element['attachShadow']

  // Keep a reference so the handle isn't tree-shaken; exposes pierced roots for
  // any future MAIN-world consumer that needs them.
  ;(window as unknown as Record<string, unknown>).__recospecClosedShadow = handle
}
