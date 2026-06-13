/**
 * Floating "REC ●" indicator the content script paints onto the page while
 * a capture session is running. Lives in a closed shadow root attached to a
 * host element on `document.body` so page CSS cannot reach it — see the
 * `closed` MutationObserver evasion note in W4. Top-frame only: nested
 * iframes never mount the badge to avoid duplicate indicators.
 */

const HOST_ID = 'recospec-recording-badge-host'

let host: HTMLElement | null = null

function isTopFrame(): boolean {
  try {
    return window === window.top
  } catch {
    // Cross-origin iframe parent access throws — treat as a nested frame so
    // we never mount a duplicate badge.
    return false
  }
}

function buildBadge(): DocumentFragment {
  // Inline `<style>` keeps the badge zero-asset and self-contained. The
  // keyframes live inside the shadow root so they cannot collide with page
  // animations of the same name.
  const fragment = document.createDocumentFragment()

  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; }
    .badge {
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 9999px;
      background: rgba(17, 24, 39, 0.92);
      color: #fff;
      font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      letter-spacing: 0.08em;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      pointer-events: none;
      user-select: none;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 9999px;
      background: #ef4444;
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
      animation: recospec-rec-pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes recospec-rec-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); transform: scale(1); }
      50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); transform: scale(1.05); }
    }
    @media (prefers-reduced-motion: reduce) {
      .dot { animation: none; }
    }
  `

  const badge = document.createElement('div')
  badge.className = 'badge'
  badge.setAttribute('role', 'status')
  badge.setAttribute('aria-label', 'Recospec recording')

  const dot = document.createElement('span')
  dot.className = 'dot'
  dot.setAttribute('aria-hidden', 'true')

  const label = document.createElement('span')
  label.textContent = 'REC'

  badge.append(dot, label)
  fragment.append(style, badge)
  return fragment
}

/**
 * Mount the badge. Idempotent — calling it twice without an intervening
 * unmount leaves a single instance attached. No-op outside the top frame.
 */
export function mountBadge(): void {
  if (!isTopFrame()) return
  if (typeof document === 'undefined' || !document.body) return
  if (host && host.isConnected) return

  host = document.createElement('div')
  host.id = HOST_ID
  // The host itself must sit above page modals. The badge inside is
  // `position: fixed` so the host's own positioning does not matter, but a
  // hostile `body { overflow: hidden }` cannot crop a fixed descendant.
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;'

  const shadow = host.attachShadow({ mode: 'closed' })
  shadow.appendChild(buildBadge())
  document.body.appendChild(host)
}

/**
 * Remove the badge. Idempotent — calling it without a prior mount is a no-op.
 */
export function unmountBadge(): void {
  if (host && host.parentNode) {
    host.parentNode.removeChild(host)
  }
  host = null
}

/** Test-only: is the badge currently in the DOM? */
export function isBadgeMounted(): boolean {
  return host !== null && host.isConnected
}
