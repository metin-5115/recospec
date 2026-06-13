import { computeAccessibleName as domComputeAccessibleName } from 'dom-accessibility-api'
import { MAX_TEXT_CONTENT_LENGTH } from '@shared/constants'

const NAME_FROM_CONTENT_ROLES = new Set([
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'gridcell',
  'heading',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'row',
  'rowheader',
  'switch',
  'tab',
  'tooltip',
  'treeitem',
])

const TAG_TO_ROLE_HINT: Record<string, string> = {
  button: 'button',
  a: 'link',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  summary: 'button',
}

function resolveIdRefs(ids: string, doc: Document): string | null {
  const texts = ids
    .split(/\s+/)
    .map((id) => doc.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim())
    .filter((t): t is string => Boolean(t))
  return texts.length > 0 ? texts.join(' ') : null
}

function findAssociatedLabel(el: Element, doc: Document): string | null {
  const id = el.getAttribute('id')
  if (id) {
    const label = doc.querySelector(`label[for="${CSS.escape(id)}"]`)
    const text = label?.textContent?.replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  const wrapping = el.closest('label')
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as Element
    clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove())
    const text = clone.textContent?.replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return null
}

function nativeName(el: Element, doc: Document): string | null {
  const tag = el.tagName.toLowerCase()

  if (
    tag === 'input' ||
    tag === 'select' ||
    tag === 'textarea' ||
    tag === 'meter' ||
    tag === 'progress' ||
    tag === 'output'
  ) {
    const fromLabel = findAssociatedLabel(el, doc)
    if (fromLabel) return fromLabel
    if (tag === 'input') {
      const type = (el.getAttribute('type') ?? '').toLowerCase()
      if (type === 'button' || type === 'submit' || type === 'reset') {
        const value = el.getAttribute('value')?.trim()
        if (value) return value
      }
    }
  }

  if (tag === 'img' || tag === 'area') {
    const alt = el.getAttribute('alt')?.trim()
    if (alt) return alt
  }

  if (tag === 'fieldset') {
    const legend = el.querySelector(':scope > legend')
    const text = legend?.textContent?.replace(/\s+/g, ' ').trim()
    if (text) return text
  }

  if (tag === 'table') {
    const caption = el.querySelector(':scope > caption')
    const text = caption?.textContent?.replace(/\s+/g, ' ').trim()
    if (text) return text
  }

  if (tag === 'iframe') {
    const title = el.getAttribute('title')?.trim()
    if (title) return title
  }

  return null
}

function nameFromContents(el: Element, role: string | null): string | null {
  const tag = el.tagName.toLowerCase()
  const allows = role
    ? NAME_FROM_CONTENT_ROLES.has(role)
    : NAME_FROM_CONTENT_ROLES.has(TAG_TO_ROLE_HINT[tag] ?? '')
  if (!allows) return null
  const text = el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) return null
  if (text.length > MAX_TEXT_CONTENT_LENGTH) return null
  return text
}

function placeholderName(el: Element): string | null {
  const tag = el.tagName.toLowerCase()
  if (tag !== 'input' && tag !== 'textarea') return null
  const placeholder = el.getAttribute('placeholder')?.trim()
  return placeholder ? placeholder : null
}

/**
 * Computes the accessible name for an element. Primary implementation is
 * `dom-accessibility-api` (the testing-library accname engine — spec-complete
 * and the same algorithm Playwright-style `getByRole(name)` queries follow).
 * Falls back to the project's legacy ARIA-ordered chain when the library
 * yields no name, which preserves two project-specific behaviours: the
 * `aria-describedby` last-resort and lenient handling of detached/jsdom edge
 * cases the library may throw on.
 */
export function computeAccessibleName(
  el: Element,
  doc: Document,
  role: string | null = null,
): string | null {
  try {
    const name = domComputeAccessibleName(el).replace(/\s+/g, ' ').trim()
    if (name) return name
  } catch {
    /* detached node / unsupported shape — fall through to the legacy chain */
  }
  return legacyAccessibleName(el, doc, role)
}

function legacyAccessibleName(el: Element, doc: Document, role: string | null): string | null {
  const labelledBy = el.getAttribute('aria-labelledby')?.trim()
  if (labelledBy) {
    const text = resolveIdRefs(labelledBy, doc)
    if (text) return text
  }

  const ariaLabel = el.getAttribute('aria-label')?.trim()
  if (ariaLabel) return ariaLabel

  const fromHostLanguage = nativeName(el, doc)
  if (fromHostLanguage) return fromHostLanguage

  const fromContent = nameFromContents(el, role)
  if (fromContent) return fromContent

  const placeholder = placeholderName(el)
  if (placeholder) return placeholder

  const title = el.getAttribute('title')?.trim()
  if (title) return title

  const describedBy = el.getAttribute('aria-describedby')?.trim()
  if (describedBy) {
    const text = resolveIdRefs(describedBy, doc)
    if (text) return text
  }

  return null
}
