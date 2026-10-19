import type { ElementFingerprint } from '@shared/types/locator'
import { isDynamicValue } from '@shared/dynamic-value'
import { DYNAMIC_VALUE_MASK as MASK } from '@shared/constants'
import { computeAccessibleName } from '../strategies/accessible-name'

/**
 * Capture the element's structural identity for self-healing. When every
 * locator in the bundle later fails, this fingerprint is what a recovery
 * layer matches against the mutated DOM. Values classified as dynamic data
 * are masked so the fingerprint itself does not rot with the data.
 */

const NEIGHBOR_TEXT_MAX = 60

/** Attributes whose values are noise for identity matching. */
const SKIPPED_ATTRS = new Set(['style', 'd', 'points', 'transform'])

function maskedAttributes(el: Element): Record<string, string> {
  const out: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    if (SKIPPED_ATTRS.has(attr.name)) continue
    out[attr.name] = isDynamicValue(attr.value) ? MASK : attr.value
  }
  return out
}

function neighborText(el: Element | null): string | null {
  const text = el?.textContent?.replace(/\s+/g, ' ').trim()
  if (!text) return null
  const clipped = text.slice(0, NEIGHBOR_TEXT_MAX)
  return isDynamicValue(clipped) ? MASK : clipped
}

const HEADING_TAGS: ReadonlySet<string> = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'legend',
  'caption',
])

/**
 * First direct child that titles its parent. Walks siblings instead of a
 * `:scope > …` query (scans the whole subtree) or the `children` collection
 * (slow to enumerate in jsdom): on `<body>` or a long list either costs tens
 * of milliseconds per click.
 */
function directHeadingChild(parent: Element): Element | undefined {
  for (let child = parent.firstElementChild; child; child = child.nextElementSibling) {
    if (HEADING_TAGS.has(child.localName) || child.getAttribute('role') === 'heading') return child
  }
  return undefined
}

function nearestHeadingText(el: Element): string | null {
  let current: Element | null = el.parentElement
  while (current) {
    const heading = directHeadingChild(current)
    const text = heading?.textContent?.replace(/\s+/g, ' ').trim()
    if (text) return text.slice(0, NEIGHBOR_TEXT_MAX)
    current = current.parentElement
  }
  return null
}

function tagOnlyPath(el: Element): string {
  const tags: string[] = []
  let current: Element | null = el
  while (current && current.tagName.toLowerCase() !== 'html') {
    tags.unshift(current.tagName.toLowerCase())
    current = current.parentElement
  }
  return tags.join('>')
}

export interface FingerprintContext {
  /** Live viewport size — supplied by the content-script adapter. */
  viewport?: { width: number; height: number }
}

export function buildFingerprint(
  el: Element,
  doc: Document,
  ctx: FingerprintContext = {},
): ElementFingerprint {
  const role = el.getAttribute('role') ?? null

  const neighborTexts = [
    neighborText(el.previousElementSibling),
    neighborText(el.nextElementSibling),
    nearestHeadingText(el),
  ].filter((t): t is string => Boolean(t))

  // ASSUMPTION: jsdom returns a zero rect (no layout engine) — ratio degrades
  // to {0,0} in unit tests and resolves to real values in the live page.
  let boundingBoxRatio = { x: 0, y: 0 }
  try {
    const rect = el.getBoundingClientRect()
    const width = ctx.viewport?.width ?? doc.defaultView?.innerWidth ?? 0
    const height = ctx.viewport?.height ?? doc.defaultView?.innerHeight ?? 0
    if (width > 0 && height > 0 && (rect.width > 0 || rect.height > 0)) {
      boundingBoxRatio = {
        x: Math.min(1, Math.max(0, (rect.x + rect.width / 2) / width)),
        y: Math.min(1, Math.max(0, (rect.y + rect.height / 2) / height)),
      }
    }
  } catch {
    /* keep zero ratio */
  }

  return {
    tag: el.tagName.toLowerCase(),
    attributes: maskedAttributes(el),
    role,
    accessibleName: computeAccessibleName(el, doc, role),
    neighborTexts,
    domPath: tagOnlyPath(el),
    boundingBoxRatio,
  }
}
