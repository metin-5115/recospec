import type { LocatorEdgeCase } from '@shared/types/locator'

const HOVER_ONLY_HINT_CLASSES = [
  'dropdown-menu',
  'submenu',
  'tooltip',
  'popover',
  'flyout',
  'hover-menu',
] as const

const HOVER_ONLY_HINT_ROLES = ['menu', 'menuitem', 'tooltip'] as const

const PORTAL_HINT_IDS = [
  'modal-root',
  'portal-root',
  'tooltip-root',
  'overlay-root',
  'headlessui-portal-root',
] as const

const PORTAL_HINT_ATTRS = ['data-portal', 'data-tippy-root', 'data-radix-portal'] as const

export function isCanvasLikeElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'canvas') return true
  if (tag === 'video' && !el.hasAttribute('controls')) return true
  if (tag === 'svg' && !el.hasAttribute('role') && !el.hasAttribute('aria-label')) return true
  return false
}

function elementHasInlineHidden(el: Element): boolean {
  const style = el.getAttribute('style') ?? ''
  if (/display\s*:\s*none/i.test(style)) return true
  if (/visibility\s*:\s*hidden/i.test(style)) return true
  return false
}

export function isHoverOnlyContext(el: Element): boolean {
  let current: Element | null = el
  while (current && current.tagName.toLowerCase() !== 'body') {
    const role = current.getAttribute('role')
    if (role && (HOVER_ONLY_HINT_ROLES as readonly string[]).includes(role)) return true

    const classList = Array.from(current.classList)
    if (
      classList.some((c) =>
        HOVER_ONLY_HINT_CLASSES.includes(c as (typeof HOVER_ONLY_HINT_CLASSES)[number]),
      )
    )
      return true

    if (current !== el && elementHasInlineHidden(current)) {
      const childrenHidden = Array.from(current.children).every(
        (child) => child.getAttribute('aria-hidden') !== 'false',
      )
      if (childrenHidden) return true
    }

    current = current.parentElement
  }
  return false
}

export function isPortalContext(el: Element, doc: Document): boolean {
  let current: Element | null = el
  while (current && current.parentElement && current.parentElement !== doc.body) {
    current = current.parentElement
  }
  if (!current) return false

  for (const attr of PORTAL_HINT_ATTRS) {
    if (current.hasAttribute(attr)) return true
  }
  const id = current.getAttribute('id')
  if (id && (PORTAL_HINT_IDS as readonly string[]).includes(id)) return true

  const classList = Array.from(current.classList)
  if (classList.some((c) => /^(portal|overlay|modal-root)/i.test(c))) return true

  return false
}

export function detectEdgeCases(el: Element, doc: Document): LocatorEdgeCase[] {
  const edges: LocatorEdgeCase[] = []
  if (isCanvasLikeElement(el)) {
    edges.push({
      kind: 'canvas',
      message:
        'Element has no addressable DOM hooks (canvas/webgl/decorative svg) — emit a manual-coordinate action.',
    })
  }
  if (isHoverOnlyContext(el)) {
    edges.push({
      kind: 'hover-only',
      message:
        'Element appears inside a hover-revealed menu/tooltip — generated test must wait for visibility before interacting.',
    })
  }
  if (isPortalContext(el, doc)) {
    edges.push({
      kind: 'portal',
      message:
        'Element is rendered through a React-style portal (escapes parent context) — locator falls back to overlay-root scope.',
    })
  }
  return edges
}
