/**
 * Closed shadow-root piercing — the invasive, OPT-IN path.
 *
 * A closed shadow root (`attachShadow({ mode: 'closed' })`) is invisible to
 * any code outside the component: `host.shadowRoot` is `null` and
 * `getRootNode()` will not cross it. The recorder cannot compute a locator for
 * an element it cannot reach.
 *
 * The only way to see inside is to wrap `Element.prototype.attachShadow`
 * BEFORE the page's components run (MAIN world, `run_at: document_start`).
 * Two things happen per wrapped call:
 *
 *   1. The original host→root pairing is always remembered in a WeakMap, so we
 *      can later report "there was a closed shadow root here" with zero page
 *      impact (storing a reference changes nothing observable).
 *   2. When piercing is ENABLED, the requested `closed` mode is coerced to
 *      `open` so the recorder's normal open-shadow path can reach the element.
 *      This is page-observable (`host.shadowRoot` becomes non-null) — hence
 *      opt-in and surfaced to the user as a "closed-shadow pierced" badge.
 *
 * This module is pure (operates on any prototype object) so it is fully
 * jsdom-testable; `closed-shadow-proxy.ts` is the thin MAIN-world bootstrap
 * that installs it onto the real `Element.prototype`.
 */

/** Minimal structural type for the prototype we patch — keeps the module DOM-free. */
export interface ShadowAttachable {
  attachShadow(init: ShadowRootInit): ShadowRoot
}

export interface ClosedShadowProxyOptions {
  /**
   * When true, closed roots are coerced to open so the recorder can pierce
   * them. When false (default), the wrapper only observes — no behaviour
   * change to the page.
   */
  pierce: boolean
}

export interface ClosedShadowProxyHandle {
  /** The shadow root we captured for a host, or null if none/inaccessible. */
  getClosedRoot(host: ShadowAttachable): ShadowRoot | null
  /** True when the host originally requested a CLOSED shadow root. */
  wasClosed(host: ShadowAttachable): boolean
  /** Restore the original `attachShadow`. Idempotent. */
  uninstall(): void
}

/**
 * Wrap `target.attachShadow`. Returns a handle exposing the captured closed
 * roots and an uninstaller. Installing twice on the same target is a no-op
 * after the first (the wrapper detects its own marker).
 */
export function installClosedShadowProxy(
  target: ShadowAttachable,
  options: ClosedShadowProxyOptions,
): ClosedShadowProxyHandle {
  const closedRoots = new WeakMap<ShadowAttachable, ShadowRoot>()
  const wasClosedSet = new WeakSet<ShadowAttachable>()

  const original = target.attachShadow
  const MARKER = '__recospecClosedShadowWrapped'
  const alreadyWrapped = (original as unknown as Record<string, unknown>)[MARKER] === true

  const wrapped = function patchedAttachShadow(
    this: ShadowAttachable,
    init: ShadowRootInit,
  ): ShadowRoot {
    const wantsClosed = init.mode === 'closed'
    // Coerce to open only when piercing is enabled; otherwise honour the page.
    const effectiveInit: ShadowRootInit =
      wantsClosed && options.pierce ? { ...init, mode: 'open' } : init
    const root = original.call(this, effectiveInit)
    if (wantsClosed) {
      wasClosedSet.add(this)
      closedRoots.set(this, root)
    }
    return root
  } as ShadowAttachable['attachShadow']
  ;(wrapped as unknown as Record<string, unknown>)[MARKER] = true

  if (!alreadyWrapped) {
    target.attachShadow = wrapped
  }

  return {
    getClosedRoot(host) {
      const captured = closedRoots.get(host)
      if (captured) return captured
      // Open-coerced roots are also reachable via the standard property.
      const maybe = (host as unknown as { shadowRoot?: ShadowRoot | null }).shadowRoot
      return maybe ?? null
    },
    wasClosed(host) {
      return wasClosedSet.has(host)
    },
    uninstall() {
      if (target.attachShadow === wrapped) {
        target.attachShadow = original
      }
    },
  }
}
