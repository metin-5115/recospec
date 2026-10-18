import { LLM_CONTEXT_LOCATOR_MAX } from '@shared/constants'
import { isCssModuleClass } from '@locator/scoring/dynamic-detector'
import type { LlmLocator } from './llm-context-types'

/**
 * Pure predicates that decide which recorded detail is not worth a model's tokens:
 * locators built on generated class names, transient UI-state attributes and
 * structureless DOM paths.
 */

/**
 * BEM modifiers that only exist while the pointer, focus or a transient widget state is on the
 * element. Broader than the locator engine's pointer-state check: here the verdict is advisory
 * (drop a fallback, mark a primary), not a ban on building a locator.
 */
const TRANSIENT_MODIFIER = /--(hover|hoverEnd|active|focus|focused|pressed|selected|open|opened)\b/

const CLASS_TOKEN = /[A-Za-z][\w-]*/g

/** UI-state attributes whose recorded value says nothing about the element's identity. */
const STATE_ATTRIBUTES: ReadonlySet<string> = new Set([
  'tabindex',
  'aria-expanded',
  'aria-selected',
  'aria-checked',
  'aria-pressed',
  'aria-current',
  'aria-hidden',
  'aria-busy',
  'aria-disabled',
  'aria-activedescendant',
  'aria-autocomplete',
  'aria-haspopup',
  'aria-controls',
  'aria-owns',
])

/** Tags that carry no meaning in an ancestor path. */
const GENERIC_TAGS: ReadonlySet<string> = new Set(['div', 'span'])

/** True when a css/xpath value leans on a generated class or a transient state class. */
export function isFragileLocator(value: string): boolean {
  if (TRANSIENT_MODIFIER.test(value)) return true
  return (value.match(CLASS_TOKEN) ?? []).some(isCssModuleClass)
}

/** A fallback is worth keeping only if it is short, durable and not a copy of the primary. */
export function isUsableFallback(fallback: LlmLocator, primary: string): boolean {
  if (fallback.value.length > LLM_CONTEXT_LOCATOR_MAX) return false
  if (`${fallback.strategy}:${fallback.value}` === primary) return false
  return !isFragileLocator(fallback.value)
}

export function isStateAttribute(name: string): boolean {
  return STATE_ATTRIBUTES.has(name)
}

/**
 * Ancestor chain reduced to semantic tags (`main>form>input`). `div`/`span` ancestors are
 * dropped; undefined when nothing semantic is left, since the element's own tag is already listed.
 */
export function semanticDomPath(domPath: string, maxAncestors: number): string | undefined {
  const segments = domPath.split('>').filter((s) => s.length > 0 && s !== 'body')
  const element = segments.pop()
  if (!element) return undefined
  const ancestors = segments.filter((s) => !GENERIC_TAGS.has(s)).slice(-maxAncestors)
  return ancestors.length > 0 ? [...ancestors, element].join('>') : undefined
}
