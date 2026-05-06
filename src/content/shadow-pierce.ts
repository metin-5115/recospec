import type { ShadowContext, FrameContext } from '@shared/types/locator'

/**
 * Build a stable CSS selector for a shadow host element.
 * Uses data-testid / id / tag+nth-child, mirroring the locator engine priority.
 */
function buildHostSelector(host: Element): string {
  const testId =
    host.getAttribute('data-testid') ??
    host.getAttribute('data-test-id') ??
    host.getAttribute('data-test')
  if (testId) return `[data-testid="${testId}"]`

  const id = host.getAttribute('id')
  if (id) return `#${CSS.escape(id)}`

  const tag = host.tagName.toLowerCase()
  const parent = host.parentElement
  if (!parent) return tag

  const siblings = Array.from(parent.children).filter((c) => c.tagName === host.tagName)
  if (siblings.length === 1) return tag

  const idx = siblings.indexOf(host) + 1
  return `${tag}:nth-child(${idx})`
}

/**
 * Walk from `element` upward through shadow boundaries and collect the host
 * selector chain for each shadow root crossed.
 *
 * Returns null when the element is not inside any shadow root.
 * Sets `closed = true` when a closed shadow root is detected (mode === 'closed').
 */
export function detectShadowContext(
  element: Element,
): { context: ShadowContext; closed: boolean } | null {
  const root = element.getRootNode({ composed: false })
  if (!(root instanceof ShadowRoot)) return null

  const hostChain: string[] = []
  let current: Node = root

  while (current instanceof ShadowRoot) {
    const host = current.host
    hostChain.unshift(buildHostSelector(host))
    current = host.getRootNode({ composed: false })
  }

  const closed = root.mode === 'closed'
  return { context: { hostChain }, closed }
}

/**
 * Returns a FrameContext when the content script is running inside an iframe,
 * or null when it is in the top-level document.
 */
export function detectFrameContext(): FrameContext | null {
  if (window === window.top) return null

  const frameChain: string[] = []
  let win: Window | null = window

  // Walk from current frame to top, collecting locator expressions
  while (win && win !== win.top) {
    const parent = win.parent

    // Find the <iframe> element in the parent document that contains `win`
    let frameEl: HTMLIFrameElement | null = null
    try {
      const frames = Array.from(parent.document.querySelectorAll('iframe'))
      frameEl =
        frames.find((f) => {
          try {
            return f.contentWindow === win
          } catch {
            return false
          }
        }) ?? null
    } catch {
      // Cross-origin parent — cannot inspect
    }

    if (frameEl) {
      const name = frameEl.getAttribute('name')
      const title = frameEl.getAttribute('title')
      const id = frameEl.getAttribute('id')
      if (name) {
        frameChain.unshift(`iframe[name="${name}"]`)
      } else if (id) {
        frameChain.unshift(`iframe#${CSS.escape(id)}`)
      } else if (title) {
        frameChain.unshift(`iframe[title="${title}"]`)
      } else {
        frameChain.unshift('iframe')
      }
    } else {
      frameChain.unshift('iframe')
    }

    win = parent !== win ? parent : null
  }

  return {
    frameUrl: location.href,
    frameName: window.name || undefined,
    frameTitle: document.title || undefined,
    frameChain,
  }
}
