import type { Locator, ScoredLocator, ShadowContext, FrameContext } from '@shared/types/locator'
import type {
  LocatorEvaluation,
  LocatorValidationResult,
  LocatorValidationStatus,
  LocatorValidationTarget,
  SerializableRect,
} from '@shared/types/messages'
import { LOCATOR_VALIDATION_HIGHLIGHT_DURATION_MS } from '@shared/constants'
import { IMPLICIT_ROLE_TABLE } from '@locator/strategies/role-table'
import { computeAccessibleName } from '@locator/strategies/accessible-name'
import { logger } from '@shared/logger'

interface EvalOutcome {
  matchCount: number
  status: LocatorValidationStatus
  firstMatch: Element | null
}

const CSS_DIRECT_QUERYABLE = new Set<ScoredLocator['strategy']>([
  'test-attr',
  'aria-label',
  'aria-labelledby',
  'id',
  'css',
])

/**
 * Resolve the document/root to query against, walking through any shadow hosts
 * recorded with the original locator. Returns null when a host can't be found
 * (DOM diverged from recording) or when a closed shadow root blocks us.
 */
function resolveRoot(
  shadow: ShadowContext | undefined,
  frame: FrameContext | undefined,
): ParentNode | null {
  // Frame piercing: only same-origin iframes can be inspected. The content
  // script runs in every frame independently; for cross-origin frames, the
  // top-frame validator returns matchCount=0 with status='cross-origin' so
  // the UI can surface a clear message.
  let doc: Document = document
  if (frame && frame.frameChain.length > 0) {
    let win: Window = window
    for (const selector of frame.frameChain) {
      try {
        const iframe = win.document.querySelector<HTMLIFrameElement>(selector)
        if (!iframe?.contentWindow) return null
        // Touching contentWindow.document throws on cross-origin.
        const inner = iframe.contentWindow.document
        win = iframe.contentWindow
        doc = inner
      } catch {
        return null
      }
    }
  }

  if (!shadow || shadow.hostChain.length === 0) return doc

  let root: ParentNode = doc
  for (const hostSelector of shadow.hostChain) {
    const host = root.querySelector(hostSelector)
    if (!host || !host.shadowRoot) return null
    root = host.shadowRoot
  }
  return root
}

function evalCss(selector: string, root: ParentNode): EvalOutcome {
  try {
    const matches = root.querySelectorAll(selector)
    return {
      matchCount: matches.length,
      status: matches.length === 1 ? 'matched' : matches.length === 0 ? 'missing' : 'multiple',
      firstMatch: matches[0] ?? null,
    }
  } catch {
    return { matchCount: 0, status: 'missing', firstMatch: null }
  }
}

function evalXpath(expression: string, root: ParentNode): EvalOutcome {
  // doc.evaluate lives on Document. Find the owning document for any root.
  const ownerDoc =
    root instanceof Document ? root : ((root as Element | ShadowRoot).ownerDocument ?? document)
  const contextNode = root instanceof Document ? root.documentElement : (root as Node)
  if (!contextNode) return { matchCount: 0, status: 'missing', firstMatch: null }
  try {
    const result = ownerDoc.evaluate(
      expression,
      contextNode,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    )
    const length = result.snapshotLength
    const first = length > 0 ? (result.snapshotItem(0) as Element | null) : null
    return {
      matchCount: length,
      status: length === 1 ? 'matched' : length === 0 ? 'missing' : 'multiple',
      firstMatch: first instanceof Element ? first : null,
    }
  } catch {
    return { matchCount: 0, status: 'missing', firstMatch: null }
  }
}

/**
 * Best-effort `role+name` lookup against the live DOM. Resolves the role to
 * its implicit-element selectors via the same `IMPLICIT_ROLE_TABLE` the
 * locator engine uses at record time, then matches each candidate's
 * accessible name (label/aria-label/contents) — i.e. the same logic
 * Playwright's `getByRole` follows.
 */
function evalRoleName(selector: string, root: ParentNode): EvalOutcome {
  // Selector format from RoleNameStrategy: `${role}[name="${name}"]`
  const match = /^([a-z-]+)\[name="(.+)"\]$/i.exec(selector)
  if (!match) return { matchCount: 0, status: 'missing', firstMatch: null }
  const [, role, name] = match

  const ownerDoc =
    root instanceof Document ? root : ((root as Element | ShadowRoot).ownerDocument ?? document)

  // Build a CSS selector for "elements that explicitly have this role OR
  // implicitly do via their tag/type". Empty implicit list still works —
  // we always include the explicit-role branch.
  const implicitSelectors = IMPLICIT_ROLE_TABLE.filter((row) => row.role === role).map(
    (row) => row.selector,
  )
  const cssQuery = [`[role="${role}"]`, ...implicitSelectors].join(',')

  let candidates: NodeListOf<Element>
  try {
    candidates = root.querySelectorAll(cssQuery)
  } catch {
    return { matchCount: 0, status: 'missing', firstMatch: null }
  }

  let count = 0
  let first: Element | null = null
  candidates.forEach((el) => {
    const accessibleName = computeAccessibleName(el, ownerDoc, role)
    if (!accessibleName) return
    if (accessibleName.toLowerCase() !== name.toLowerCase()) return
    count += 1
    if (!first) first = el
  })
  return {
    matchCount: count,
    status: count === 1 ? 'matched' : count === 0 ? 'missing' : 'multiple',
    firstMatch: first,
  }
}

function evalText(selector: string, root: ParentNode): EvalOutcome {
  // TextStrategy stores the normalized text directly; render targets use
  // exact-match (`getByText(..., { exact: true })`, `cy.contains(text)`).
  // Mirror that here: whitespace-normalize each candidate's *full* text and
  // compare for equality so multiple ancestors of the same text node don't
  // each count as a hit.
  const wanted = selector.replace(/^:has-text\((['"]?)(.*)\1\)$/, '$2').trim()
  if (!wanted) return { matchCount: 0, status: 'missing', firstMatch: null }
  const all = root.querySelectorAll('*')
  let count = 0
  let first: Element | null = null
  all.forEach((el) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text === wanted) {
      count += 1
      if (!first) first = el
    }
  })
  // querySelectorAll('*') hits each ancestor of a leaf text node; keep only the
  // innermost element (Playwright/Cypress also prefer the deepest match).
  if (first) {
    const innermost = Array.from(all).find(
      (el) =>
        (el.textContent ?? '').replace(/\s+/g, ' ').trim() === wanted && el.children.length === 0,
    )
    if (innermost) {
      first = innermost
      count = Array.from(all).filter(
        (el) =>
          (el.textContent ?? '').replace(/\s+/g, ' ').trim() === wanted && el.children.length === 0,
      ).length
    }
  }
  return {
    matchCount: count,
    status: count === 1 ? 'matched' : count === 0 ? 'missing' : 'multiple',
    firstMatch: first,
  }
}

function evalLabel(selector: string, root: ParentNode): EvalOutcome {
  // LabelStrategy stores something like `label:has-text("Email") + input` —
  // not directly queryable. Walk <label> elements that match the text.
  const match = /label:has-text\((['"])(.+)\1\)/i.exec(selector)
  const labelText = match?.[2] ?? selector
  const labels = root.querySelectorAll('label')
  let count = 0
  let first: Element | null = null
  labels.forEach((label) => {
    if (!(label.textContent ?? '').trim().includes(labelText)) return
    const forId = label.getAttribute('for')
    let target: Element | null
    if (forId) {
      const ownerDoc =
        root instanceof Document ? root : ((root as Element | ShadowRoot).ownerDocument ?? document)
      target = ownerDoc.getElementById(forId)
    } else {
      target = label.querySelector('input, textarea, select')
    }
    if (target) {
      count += 1
      if (!first) first = target
    }
  })
  return {
    matchCount: count,
    status: count === 1 ? 'matched' : count === 0 ? 'missing' : 'multiple',
    firstMatch: first,
  }
}

function evalTestId(selector: string, root: ParentNode): EvalOutcome {
  const escaped = selector.replace(/"/g, '\\"')
  const css = `[data-testid="${escaped}"], [data-test-id="${escaped}"], [data-test="${escaped}"]`
  return evalCss(css, root)
}

export function evaluateLocator(
  locator: Locator,
  shadow: ShadowContext | undefined,
  frame: FrameContext | undefined,
): EvalOutcome {
  const root = resolveRoot(shadow, frame)
  if (!root) {
    return { matchCount: 0, status: 'cross-origin', firstMatch: null }
  }

  if (typeof locator.selector !== 'string') {
    // Non-string selectors aren't supported by any current strategy; bail safely.
    return { matchCount: 0, status: 'missing', firstMatch: null }
  }

  if (locator.strategy === 'testid') return evalTestId(locator.selector, root)
  if (locator.strategy === 'xpath') return evalXpath(locator.selector, root)
  if (locator.strategy === 'role-name') return evalRoleName(locator.selector, root)
  if (locator.strategy === 'text') return evalText(locator.selector, root)
  if (locator.strategy === 'label') return evalLabel(locator.selector, root)
  if (CSS_DIRECT_QUERYABLE.has(locator.strategy)) return evalCss(locator.selector, root)

  return evalCss(locator.selector, root)
}

function rectOf(el: Element): SerializableRect {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

function toEvaluation(loc: ScoredLocator | Locator, outcome: EvalOutcome): LocatorEvaluation {
  return {
    strategy: loc.strategy,
    selector: loc.selector,
    status: outcome.status,
    matchCount: outcome.matchCount,
  }
}

export function validateTargets(targets: LocatorValidationTarget[]): LocatorValidationResult[] {
  return targets.map((target) => {
    const primaryOutcome = evaluateLocator(
      target.primary,
      target.shadowContext,
      target.frameContext,
    )
    const fallbackOutcomes = target.fallbacks.map((fb) =>
      evaluateLocator(fb, target.shadowContext, target.frameContext),
    )
    const result: LocatorValidationResult = {
      actionId: target.actionId,
      index: target.index,
      label: target.label,
      primary: toEvaluation(target.primary, primaryOutcome),
      fallbacks: target.fallbacks.map((fb, i) => toEvaluation(fb, fallbackOutcomes[i])),
    }
    if (primaryOutcome.firstMatch) {
      result.rect = rectOf(primaryOutcome.firstMatch)
    }
    return result
  })
}

let highlightEl: HTMLDivElement | null = null
let highlightLabel: HTMLDivElement | null = null
let highlightTimer: number | null = null

function clearHighlight(): void {
  if (highlightTimer !== null) {
    window.clearTimeout(highlightTimer)
    highlightTimer = null
  }
  highlightEl?.remove()
  highlightLabel?.remove()
  highlightEl = null
  highlightLabel = null
}

function paintHighlight(rect: SerializableRect, label: string | undefined, color: string): void {
  clearHighlight()
  highlightEl = document.createElement('div')
  highlightEl.style.cssText = [
    'position:fixed',
    `top:${rect.y}px`,
    `left:${rect.x}px`,
    `width:${rect.width}px`,
    `height:${rect.height}px`,
    `background:${color}26`,
    `outline:2px solid ${color}`,
    'pointer-events:none',
    'z-index:2147483647',
    'border-radius:2px',
    'box-sizing:border-box',
    'transition:opacity 200ms ease',
  ].join(';')
  document.body.appendChild(highlightEl)

  if (label) {
    highlightLabel = document.createElement('div')
    highlightLabel.textContent = label
    const labelTop = Math.max(0, rect.y - 22)
    highlightLabel.style.cssText = [
      'position:fixed',
      `top:${labelTop}px`,
      `left:${rect.x}px`,
      `background:${color}`,
      'color:#fff',
      'padding:2px 6px',
      'font:600 11px/1 system-ui,sans-serif',
      'border-radius:4px',
      'pointer-events:none',
      'z-index:2147483647',
      'box-shadow:0 1px 2px rgba(0,0,0,.25)',
    ].join(';')
    document.body.appendChild(highlightLabel)
  }
}

export function highlightLocator(
  locator: Locator,
  shadow: ShadowContext | undefined,
  frame: FrameContext | undefined,
  label: string | undefined,
  durationMs: number = LOCATOR_VALIDATION_HIGHLIGHT_DURATION_MS,
): boolean {
  const outcome = evaluateLocator(locator, shadow, frame)
  if (!outcome.firstMatch) {
    logger.warn('[CS] highlightLocator: no match for', locator.strategy, locator.selector)
    return false
  }
  // scrollIntoView is provided by real browsers but missing in jsdom; guard so
  // unit tests can exercise the highlight path without a shim.
  outcome.firstMatch.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  const rect = rectOf(outcome.firstMatch)
  const color = outcome.status === 'matched' ? '#22c55e' : '#f59e0b'
  paintHighlight(rect, label, color)
  highlightTimer = window.setTimeout(clearHighlight, durationMs)
  return true
}

export function clearHighlightOverlay(): void {
  clearHighlight()
}
