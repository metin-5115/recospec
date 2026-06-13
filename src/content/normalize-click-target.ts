/**
 * Click-target normalization (interactive-ancestor promotion).
 *
 * When a user clicks a presentational leaf — an `<svg>`/`<path>` icon inside a
 * button, a `<span>`/`<p>` inside a clickable card — the element they MEAN to
 * target is the nearest actionable ancestor (the button, the link, the card),
 * not the leaf. Recording the leaf yields fragile positional locators; the
 * promoted ancestor gives a stable one (Playwright/Testing-Library practice:
 * "click the button, not the path inside it").
 *
 * Pure (no DOM mutation, no globals) so it is jsdom-unit-testable. Applied to
 * CLICK capture only — assertions and waits keep the exact element.
 */

const MAX_CLIMB = 4

/** Mirrors the composed strategy's testid family. */
const TESTID_ATTRS = [
  'data-testid',
  'data-test-id',
  'data-cy',
  'data-test',
  'data-qa',
  'data-automation',
] as const

const ACTIONABLE_SELECTOR =
  'button, summary, a[href], label[for], [onclick], [tabindex]:not([tabindex="-1"]), ' +
  '[role="button"], [role="link"], [role="menuitem"], [role="menuitemcheckbox"], ' +
  '[role="menuitemradio"], [role="tab"], [role="option"], [role="switch"], ' +
  '[role="checkbox"], [role="radio"]'

/** Form controls are never promoted — value capture depends on the control staying the target. */
const NEVER_PROMOTE_TAGS = new Set(['input', 'textarea', 'select'])

function hasTestId(el: Element): boolean {
  return TESTID_ATTRS.some((attr) => el.hasAttribute(attr))
}

function isActionable(el: Element): boolean {
  try {
    if (el.matches(ACTIONABLE_SELECTOR)) return true
  } catch {
    /* static selector — defensive only */
  }
  return hasTestId(el)
}

function walkParents(el: Element): Element[] {
  const out: Element[] = []
  let current = el.parentElement
  while (current) {
    out.push(current)
    current = current.parentElement
  }
  return out
}

/**
 * The closest-first ancestor `Element[]` for `el` taken from the event's
 * `composedPath` (correct across OPEN shadow roots, where `parentElement`
 * stops at the host). Returns `undefined` when no path is available so the
 * caller falls back to `parentElement`.
 */
export function ancestorsFromComposedPath(
  el: Element,
  composedPath?: readonly EventTarget[],
): Element[] | undefined {
  if (!composedPath?.length) return undefined
  const idx = composedPath.indexOf(el)
  const tail = idx === -1 ? composedPath : composedPath.slice(idx + 1)
  return tail.filter((n): n is Element => n instanceof Element)
}

/**
 * Promote a clicked leaf to its nearest actionable ancestor.
 *
 * Returns `el` unchanged when it is itself actionable, is a form control, or
 * has no actionable ancestor within `MAX_CLIMB` levels (safety valve — the
 * engine's existing fallback then handles it, exactly as before).
 *
 * @param ancestors closest-first ancestor chain (e.g. from
 *   {@link ancestorsFromComposedPath}); omit to walk `parentElement`.
 */
export function normalizeClickTarget(el: Element, ancestors?: readonly Element[]): Element {
  if (NEVER_PROMOTE_TAGS.has(el.tagName.toLowerCase())) return el
  if (isActionable(el)) return el

  const chain = ancestors ?? walkParents(el)
  let depth = 0
  for (const anc of chain) {
    if (anc === el) continue
    const tag = anc.tagName.toUpperCase()
    if (tag === 'BODY' || tag === 'HTML') break
    if (++depth > MAX_CLIMB) break
    if (isActionable(anc)) return anc
  }
  return el
}
