import type { ActionType } from '@shared/types/action'
import type { FrameContext, Locator, ShadowContext } from '@shared/types/locator'
import { evaluateLocator } from './locator-validator'
import { logger } from '@shared/logger'

export interface ReplayStepInput {
  actionType: ActionType
  primary: Locator
  fallbacks: Locator[]
  shadowContext?: ShadowContext
  frameContext?: FrameContext
  payload?: Record<string, unknown>
}

export interface ReplayStepOutcome {
  status: 'pass' | 'fail' | 'skipped'
  error?: string
}

/**
 * Walk the primary locator then each fallback until one resolves to a single
 * element. Returns null when none match — caller treats that as failure.
 */
export function resolveElement(input: ReplayStepInput): Element | null {
  const tryOrder: Locator[] = [input.primary, ...input.fallbacks]
  for (const loc of tryOrder) {
    const outcome = evaluateLocator(loc, input.shadowContext, input.frameContext)
    if (outcome.firstMatch && outcome.status === 'matched') return outcome.firstMatch
  }
  // Second pass — accept 'multiple' as a soft success, taking the first.
  // The recorded element may now be one of many similar ones; better to
  // attempt the action than to bail before trying.
  for (const loc of tryOrder) {
    const outcome = evaluateLocator(loc, input.shadowContext, input.frameContext)
    if (outcome.firstMatch) return outcome.firstMatch
  }
  return null
}

/**
 * Best-effort scroll the element into view before acting on it. jsdom does
 * not implement scrollIntoView so the call is guarded for unit tests.
 */
function bringIntoView(el: Element): void {
  ;(el as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'nearest' })
}

function dispatchMouse(el: Element, type: 'click' | 'dblclick' | 'mouseover' | 'mouseenter'): void {
  // Use the global MouseEvent constructor — jsdom exposes it but cannot
  // accept a Window-typed `view` field without throwing.
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
}

function fillInputValue(el: HTMLElement, value: string): void {
  // Native setter is required for React-controlled inputs — otherwise React
  // overwrites the value on the next render and treats the input as never-
  // touched. Mirrors the trick Playwright/Cypress use.
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (descriptor?.set) {
    descriptor.set.call(el, value)
  } else {
    ;(el as HTMLInputElement | HTMLTextAreaElement).value = value
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function setSelectValue(el: HTMLSelectElement, value: string): void {
  // Accept either an option value or label.
  const byValue = Array.from(el.options).findIndex((o) => o.value === value)
  const byLabel = Array.from(el.options).findIndex((o) => o.text === value)
  const idx = byValue >= 0 ? byValue : byLabel
  if (idx < 0) throw new Error(`<select> has no option matching "${value}"`)
  el.selectedIndex = idx
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function setChecked(el: HTMLInputElement, checked: boolean): void {
  if (el.checked === checked) return
  el.click() // also fires `change` natively and respects radio grouping
}

function dispatchKey(el: Element, key: string): void {
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    el.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }))
  }
}

const SKIPPED_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
  'assert',
  'screenshot',
  'manual-coordinate',
  'network',
  'wait',
])

/**
 * Execute one replay step. Action types that do not represent a DOM
 * interaction (`assert`, `network`, `wait`, `screenshot`,
 * `manual-coordinate`) are skipped — they belong in the generated code but
 * have no replay-time analog.
 */
export function executeReplayStep(input: ReplayStepInput): ReplayStepOutcome {
  if (SKIPPED_ACTION_TYPES.has(input.actionType)) {
    return { status: 'skipped' }
  }

  // `navigate` is special — the recorded URL is in the payload, and we hand
  // control to the browser. The background controller waits for the tab's
  // `complete` event before dispatching the next step.
  if (input.actionType === 'navigate') {
    const url = (input.payload?.url ?? input.payload?.to) as string | undefined
    if (!url) return { status: 'fail', error: 'navigate step missing payload.url' }
    try {
      window.location.href = url
      return { status: 'pass' }
    } catch (err) {
      return { status: 'fail', error: err instanceof Error ? err.message : String(err) }
    }
  }

  const el = resolveElement(input)
  if (!el) {
    return {
      status: 'fail',
      error: `Locator did not resolve to any element (strategy=${input.primary.strategy}).`,
    }
  }

  try {
    bringIntoView(el)
    switch (input.actionType) {
      case 'click':
        dispatchMouse(el, 'click')
        break
      case 'dblclick':
        dispatchMouse(el, 'dblclick')
        break
      case 'hover':
        dispatchMouse(el, 'mouseover')
        dispatchMouse(el, 'mouseenter')
        break
      case 'fill': {
        const value = (input.payload?.value as string | undefined) ?? ''
        if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
          throw new Error(`Cannot fill <${el.tagName.toLowerCase()}> element`)
        }
        ;(el as HTMLElement).focus?.()
        fillInputValue(el as HTMLElement, value)
        break
      }
      case 'select': {
        const value = (input.payload?.value as string | undefined) ?? ''
        if (!(el instanceof HTMLSelectElement)) {
          throw new Error(`Cannot select on <${el.tagName.toLowerCase()}> element`)
        }
        setSelectValue(el, value)
        break
      }
      case 'check':
      case 'uncheck': {
        if (!(el instanceof HTMLInputElement)) {
          throw new Error(`Cannot check <${el.tagName.toLowerCase()}> element`)
        }
        setChecked(el, input.actionType === 'check')
        break
      }
      case 'scroll': {
        const top = (input.payload?.scrollY as number | undefined) ?? 0
        const left = (input.payload?.scrollX as number | undefined) ?? 0
        window.scrollTo({ top, left, behavior: 'auto' })
        break
      }
      case 'keypress': {
        const key = (input.payload?.key as string | undefined) ?? ''
        if (!key) throw new Error('keypress step missing payload.key')
        ;(el as HTMLElement).focus?.()
        dispatchKey(el, key)
        break
      }
      default:
        return { status: 'skipped' }
    }
    return { status: 'pass' }
  } catch (err) {
    logger.warn('[CS] Replay step threw', input.actionType, err)
    return { status: 'fail', error: err instanceof Error ? err.message : String(err) }
  }
}
