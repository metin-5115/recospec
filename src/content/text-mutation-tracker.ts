/**
 * Tracks which elements' text changed while a recording session is live —
 * the strongest "volatile" signal the classifier has. A countdown, a live
 * price, or a ticking clock is marked here and can never be templated or
 * embedded into a locator.
 *
 * Elements are held in a WeakSet (no leak across long sessions); marking
 * bubbles three ancestor levels up so a click target whose CHILD span ticks
 * is itself flagged.
 *
 * Mutation records are batched and processed once per animation frame, so a page that rewrites
 * text constantly does not pay a pass per callback. Asking about an element flushes first, so a
 * change just before a click is never missed.
 */
import { MUTATION_FALLBACK_FRAME_MS } from '@shared/constants'

let observer: MutationObserver | null = null
let pending: MutationRecord[] = []
let isFlushScheduled = false
const mutatedElements = new WeakSet<Element>()

const ANCESTOR_MARK_DEPTH = 3

function markElement(el: Element | null): void {
  let current = el
  for (let depth = 0; current && depth < ANCESTOR_MARK_DEPTH; depth++) {
    mutatedElements.add(current)
    current = current.parentElement
  }
}

function process(records: MutationRecord[]): void {
  for (const record of records) {
    if (record.type === 'characterData') {
      markElement(record.target.parentElement)
    } else if (record.type === 'childList') {
      // Text nodes swapped wholesale (frameworks re-render text this way).
      const textChanged = [...record.addedNodes, ...record.removedNodes].some(
        (n) => n.nodeType === 3 /* TEXT_NODE */,
      )
      if (textChanged && record.target instanceof Element) {
        markElement(record.target)
      }
    }
  }
}

function flush(): void {
  const records = [...pending.splice(0), ...(observer?.takeRecords() ?? [])]
  if (records.length > 0) process(records)
}

function requestFrame(callback: () => void): void {
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(callback)
  else setTimeout(callback, MUTATION_FALLBACK_FRAME_MS)
}

function onMutations(records: MutationRecord[]): void {
  pending.push(...records)
  if (isFlushScheduled) return
  isFlushScheduled = true
  requestFrame(() => {
    isFlushScheduled = false
    flush()
  })
}

export function startTextMutationTracking(): void {
  if (observer) return
  observer = new MutationObserver(onMutations)
  observer.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  })
}

export function stopTextMutationTracking(): void {
  observer?.disconnect()
  observer = null
  pending = []
}

/** Did this element's (or a near descendant's) text change during the session? */
export function wasTextMutated(el: Element): boolean {
  flush()
  return mutatedElements.has(el)
}
