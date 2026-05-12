/**
 * Spinner detection: runs in the content-script ISOLATED world and watches for
 * progress/spinner-like nodes appearing in the DOM after a recorded interaction.
 *
 * The detector is intentionally side-effect-free outside of `start/stop` and
 * is unit-tested under jsdom — it must not reach for chrome.* APIs.
 */

import { SPINNER_SELECTORS } from '@shared/constants'

const QUALIFIER_SELECTOR = SPINNER_SELECTORS.join(',')

/**
 * Returns true when the node (or one of its descendants) matches a known
 * spinner pattern: `[role=progressbar]`, `.spinner`, `.loading`, `[aria-busy=true]`.
 */
export function shouldQualifyAsSpinner(node: Node): node is Element {
  if (!(node instanceof Element)) return false
  if (node.matches(QUALIFIER_SELECTOR)) return true
  return node.querySelector(QUALIFIER_SELECTOR) !== null
}

/**
 * Resolve to the qualifying spinner element if one is found in `mutations`,
 * otherwise return null. Always inspects added nodes plus aria-busy flips.
 */
export function findSpinnerInMutations(mutations: MutationRecord[]): Element | null {
  for (const m of mutations) {
    if (m.type === 'attributes' && m.attributeName === 'aria-busy') {
      const target = m.target
      if (target instanceof Element && target.getAttribute('aria-busy') === 'true') {
        return target
      }
    }
    if (m.type === 'childList') {
      for (const node of Array.from(m.addedNodes)) {
        if (shouldQualifyAsSpinner(node)) {
          return node instanceof Element && node.matches(QUALIFIER_SELECTOR)
            ? node
            : (node as Element).querySelector(QUALIFIER_SELECTOR)
        }
      }
    }
  }
  return null
}

export interface SpinnerObserveOptions {
  /** Maximum time to watch for a spinner before resolving with `null`. */
  timeoutMs: number
  /**
   * Override for tests / non-`document` roots. Defaults to `document.body`.
   */
  root?: Node
}

/**
 * Watch the DOM for a spinner node. The returned promise resolves to the
 * detected element (or `null` on timeout). The promise can be cancelled with
 * the supplied `AbortController`.
 *
 * Uses Promise + AbortController — never `setTimeout`-driven state machines.
 */
export function observeForSpinner(
  options: SpinnerObserveOptions,
  signal?: AbortSignal,
): Promise<Element | null> {
  const root = options.root ?? document.body
  return new Promise((resolve) => {
    let settled = false
    const observer = new MutationObserver((mutations) => {
      const spinner = findSpinnerInMutations(mutations)
      if (spinner && !settled) {
        settled = true
        cleanup()
        resolve(spinner)
      }
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      resolve(null)
    }, options.timeoutMs)

    function onAbort() {
      if (settled) return
      settled = true
      cleanup()
      resolve(null)
    }

    function cleanup() {
      observer.disconnect()
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort)
    }

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-busy'],
    })
  })
}

/**
 * Resolve once the supplied node detaches from the DOM (or its `aria-busy`
 * flips back to false). Used to upper-bound the `timeoutMs` we render in the
 * generated test code — recordings whose spinner clears in <1 s should not
 * encode a 30-second wait.
 */
export function waitForSpinnerCleared(
  spinner: Element,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<number> {
  const start = Date.now()
  return new Promise((resolve) => {
    let settled = false

    function done() {
      if (settled) return
      settled = true
      observer.disconnect()
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(Date.now() - start)
    }

    function onAbort() {
      done()
    }

    const observer = new MutationObserver(() => {
      const detached = !spinner.isConnected
      const busy = spinner.getAttribute('aria-busy') === 'true'
      if (detached || !busy) done()
    })

    const timer = setTimeout(done, timeoutMs)

    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort)
    }

    const root = spinner.parentNode ?? document.body
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-busy'],
    })
  })
}
