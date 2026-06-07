import { useEffect, useRef } from 'react'

/** Loose RefObject so callers can hand us either `useRef<HTMLDivElement>(null)` or any narrower HTMLElement subclass. */
type LooseRef<T extends HTMLElement> = { readonly current: T | null }

/**
 * Selectors that mark an element as keyboard-focusable. Mirrors the list
 * `focus-trap` uses but stays as a single CSS selector so it can feed
 * `querySelectorAll` directly — zero runtime dependency.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex^="-"])',
].join(',')

function getFocusable(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  // Reject only the *explicitly* hidden cases: disabled, aria-hidden, or a
  // computed `display:none` / `visibility:hidden`. We intentionally don't
  // gate on `offsetParent`/layout because jsdom never lays out elements,
  // and the visible-but-untruthy `offsetParent` case (sticky/transformed
  // parents) breaks real-DOM users.
  return candidates.filter((el) => {
    if (el.hasAttribute('disabled')) return false
    if (el.getAttribute('aria-hidden') === 'true') return false
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    return true
  })
}

export interface UseFocusTrapOptions {
  /** When false the trap unbinds — handy for transitioning modals. */
  active?: boolean
  /** Called on Escape. Required for modals to satisfy the W6 DoD. */
  onEscape?: () => void
  /**
   * Override the element that receives focus on mount. Defaults to the
   * first Tab-target inside the container; useful when an input field
   * should win over a Close button.
   */
  initialFocus?: LooseRef<HTMLElement>
}

/**
 * Keep keyboard focus inside `containerRef.current` for the lifetime of the
 * hook. On mount the first Tab-target receives focus and the previously
 * focused element is remembered; on unmount it is restored. Tab/Shift+Tab
 * cycle within the container, Esc invokes `onEscape`.
 *
 * Manual implementation rather than `focus-trap-react` to keep the side
 * panel bundle under the 500 KB DoD cap.
 */
export function useFocusTrap<T extends HTMLElement>(
  containerRef: LooseRef<T>,
  { active = true, onEscape, initialFocus }: UseFocusTrapOptions = {},
): void {
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    const container: HTMLElement | null = containerRef.current
    if (!container) return
    // Locked closure target — narrowed once, captured by the listener.
    const root: HTMLElement = container

    previousActiveElement.current = (document.activeElement as HTMLElement | null) ?? null

    // Focus the explicit initial target if supplied, otherwise the first
    // focusable inside the container, otherwise the container itself.
    const focusables = getFocusable(root)
    const target = initialFocus?.current ?? focusables[0] ?? root
    // `tabindex=-1` on the container fallback lets it actually receive focus
    // without entering the Tab cycle.
    if (target === root && !root.hasAttribute('tabindex')) {
      root.setAttribute('tabindex', '-1')
    }
    target.focus({ preventScroll: true })

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        if (onEscape) {
          event.preventDefault()
          event.stopPropagation()
          onEscape()
        }
        return
      }
      if (event.key !== 'Tab') return
      const list = getFocusable(root)
      if (list.length === 0) {
        event.preventDefault()
        root.focus({ preventScroll: true })
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (event.shiftKey && (activeEl === first || !root.contains(activeEl))) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && (activeEl === last || !root.contains(activeEl))) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Restore focus to whoever owned it before the modal opened — common
      // a11y expectation, also keeps screen readers from announcing "nothing".
      previousActiveElement.current?.focus?.({ preventScroll: true })
    }
  }, [active, containerRef, initialFocus, onEscape])
}
