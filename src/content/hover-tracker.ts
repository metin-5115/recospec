/**
 * Remembers the element the pointer last rested on and whether the DOM changed shortly after,
 * so a click inside a hover-revealed menu can be preceded by the hover that opened it.
 *
 * Hovers are never recorded on their own — a pointer crosses dozens of elements per second.
 * Only a hover that demonstrably revealed something (a DOM mutation inside the window) is
 * worth a step, and only once the user then acts on the revealed content.
 */
import { isHoverOnlyContext } from '@locator/edge-cases'
import { HOVER_DOM_CHANGE_WINDOW_MS } from '@shared/constants'

interface HoverAnchor {
  el: Element
  at: number
  hasRevealed: boolean
  isReported: boolean
}

export interface RevealingHover {
  el: Element
  at: number
}

let anchor: HoverAnchor | null = null
let observer: MutationObserver | null = null

function onMutations(): void {
  if (!anchor || anchor.hasRevealed) return
  if (Date.now() - anchor.at <= HOVER_DOM_CHANGE_WINDOW_MS) anchor.hasRevealed = true
}

export function startHoverTracking(): void {
  if (observer) return
  observer = new MutationObserver(onMutations)
  observer.observe(document.body, { childList: true, attributes: true, subtree: true })
}

export function stopHoverTracking(): void {
  observer?.disconnect()
  observer = null
  anchor = null
}

/** The pointer entered `el`. Movement inside the trigger or its revealed menu keeps the trigger. */
export function noteHover(el: Element): void {
  if (isHoverOnlyContext(el)) return
  if (anchor && (anchor.el.contains(el) || el.contains(anchor.el))) return
  anchor = { el, at: Date.now(), hasRevealed: false, isReported: false }
}

/** The hover that opened what the user is now acting on; each hover is handed out once. */
export function takeRevealingHover(): RevealingHover | null {
  if (!anchor || !anchor.hasRevealed || anchor.isReported || !anchor.el.isConnected) return null
  anchor.isReported = true
  return { el: anchor.el, at: anchor.at }
}
