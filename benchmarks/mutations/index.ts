import type { Rng } from './prng'

/**
 * DOM mutation operators that simulate the real-world churn locators must
 * survive: CSS-in-JS rebuilds, counter shifts, list reordering, layout
 * wrappers, dynamic data, conditional rendering, CSS refactors.
 *
 * Each operator mutates `doc` IN PLACE (callers pass a fresh clone) and is
 * deterministic given the seeded `Rng`. Operators MUST NEVER touch the
 * `data-bench-anchor` marker or remove/hide a marked target — the survival
 * harness uses that marker to check whether a locator re-found the SAME
 * element after the mutation.
 */

const ANCHOR_ATTR = 'data-bench-anchor'

function isMarked(el: Element): boolean {
  return el.hasAttribute(ANCHOR_ATTR)
}

function containsMarked(el: Element): boolean {
  return isMarked(el) || el.querySelector(`[${ANCHOR_ATTR}]`) !== null
}

/** A class token that looks machine-generated (CSS-in-JS / atomic CSS). */
function isHashedClass(cls: string): boolean {
  return (
    /^css-[a-z0-9]{4,}$/i.test(cls) ||
    /^sc-[a-zA-Z0-9]{5,}$/.test(cls) ||
    /^[a-z]+-[a-z0-9]*\d[a-z0-9]*$/i.test(cls) || // Mui...-273, jss12
    /^[a-z0-9]{6,}$/i.test(cls) // opaque atomic hash
  )
}

/** Replace the variable tail of hashed class names — CSS-in-JS recompile. */
export function regenerateHashedClasses(doc: Document, rng: Rng): void {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[class]'))) {
    const next = Array.from(el.classList).map((cls) =>
      isHashedClass(cls) ? `css-${rng.token(6)}` : cls,
    )
    if (next.length) el.className = next.join(' ')
  }
}

/** Increment trailing numeric counters on ids (`input-7` → `input-8`). */
export function shiftIdCounters(doc: Document, rng: Rng): void {
  const delta = rng.int(1, 3)
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[id]'))) {
    const m = el.id.match(/^(.*?)(\d+)$/)
    if (!m) continue
    el.id = `${m[1]}${Number(m[2]) + delta}`
  }
}

/** Shuffle the children of containers — list/grid reordering. */
export function reorderSiblings(doc: Document, rng: Rng): void {
  const parents = Array.from(doc.querySelectorAll<HTMLElement>('ul, ol, tbody, [role="list"], div'))
  for (const parent of parents) {
    const children = Array.from(parent.children)
    if (children.length < 2 || children.length > 30) continue
    // Only reorder when every child is a leaf-ish sibling (avoid scrambling
    // structural layout containers, which no recorder would treat as a list).
    const sameTag = children.every((c) => c.tagName === children[0]!.tagName)
    if (!sameTag) continue
    for (const node of rng.shuffle(children.slice())) parent.appendChild(node)
  }
}

/** Wrap some elements in an extra div — layout wrapper insertion. */
export function wrapWithDiv(doc: Document, rng: Rng): void {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>('button, a, input, span, li'))
  for (const el of candidates) {
    if (rng.next() > 0.4) continue
    const parent = el.parentElement
    if (!parent) continue
    const wrapper = doc.createElement('div')
    wrapper.className = `layout-${rng.token(4)}`
    parent.insertBefore(wrapper, el)
    wrapper.appendChild(el)
  }
}

/** Rewrite data-value-looking text (numbers, prices, dates) — dynamic data. */
export function changeTextValues(doc: Document, rng: Rng): void {
  const walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */)
  const edits: Array<() => void> = []
  let node = walker.nextNode()
  while (node) {
    const text = (node.nodeValue ?? '').trim()
    const current = node
    if (/^[$€₺£]?\s?\d[\d.,\s]*%?$/.test(text) && text.length > 0) {
      edits.push(() => {
        current.nodeValue = (current.nodeValue ?? '').replace(/\d/g, () => String(rng.int(0, 9)))
      })
    }
    node = walker.nextNode()
  }
  for (const edit of edits) edit()
}

/** Hide a fraction of NON-target elements — conditional rendering. */
export function toggleVisibility(doc: Document, rng: Rng): void {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>('div, section, li, span')).filter(
    (el) => !containsMarked(el),
  )
  for (const el of candidates) {
    if (rng.next() > 0.25) continue
    el.style.display = 'none'
  }
}

/** Rename human-authored (non-hashed) class names — CSS refactor. */
export function renameClasses(doc: Document, rng: Rng): void {
  const renamed = new Map<string, string>()
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[class]'))) {
    const next = Array.from(el.classList).map((cls) => {
      if (isHashedClass(cls)) return cls
      if (!renamed.has(cls)) renamed.set(cls, `r${rng.token(5)}`)
      return renamed.get(cls)!
    })
    if (next.length) el.className = next.join(' ')
  }
}

export interface MutationOperator {
  name: string
  apply: (doc: Document, rng: Rng) => void
}

/** Registry consumed by the survival harness and the bench CLI. */
export const MUTATION_OPERATORS: readonly MutationOperator[] = [
  { name: 'regenerateHashedClasses', apply: regenerateHashedClasses },
  { name: 'shiftIdCounters', apply: shiftIdCounters },
  { name: 'reorderSiblings', apply: reorderSiblings },
  { name: 'wrapWithDiv', apply: wrapWithDiv },
  { name: 'changeTextValues', apply: changeTextValues },
  { name: 'toggleVisibility', apply: toggleVisibility },
  { name: 'renameClasses', apply: renameClasses },
]

export { ANCHOR_ATTR }
