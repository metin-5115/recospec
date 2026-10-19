import type {
  ActionType,
  CapturedEvent,
  ElementSnapshot,
  NetworkPayload,
} from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import type { IRWaitInfo, IRWaitReason } from '@codegen/ir/types'
import { LocatorEngine } from '@locator/index'
import { detectShadowContext, detectFrameContext } from './shadow-pierce'
import {
  startTextMutationTracking,
  stopTextMutationTracking,
  wasTextMutated,
} from './text-mutation-tracker'
import { observeForSpinner } from './spinner-detector'
import {
  noteHover,
  startHoverTracking,
  stopHoverTracking,
  takeRevealingHover,
} from './hover-tracker'
import { setPageFlag } from './page-flag'
import { normalizeClickTarget, ancestorsFromComposedPath } from './normalize-click-target'
import { sendToBackground } from '@shared/messaging/send'
import { logger } from '@shared/logger'
import {
  AUTO_WAIT_DEFAULT_TIMEOUT_MS,
  AUTO_WAIT_NETWORK_DEBOUNCE_MS,
  ENTER_ACTIVATED_INPUT_TYPES,
  NETWORK_CAPTURE_EVENT_NAME,
  NETWORK_CAPTURE_FLAG_KEY,
  PIERCE_CLOSED_SHADOW_FLAG_KEY,
  RECORDED_KEYS,
  SNAPSHOT_TEXT_MAX_LENGTH,
} from '@shared/constants'

const engine = new LocatorEngine()
const frameContext = detectFrameContext()

function buildSnapshot(el: Element): ElementSnapshot {
  const attributes: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    attributes[attr.name] = attr.value
  }
  return {
    tagName: el.tagName.toLowerCase(),
    attributes,
    textContent: (el.textContent ?? '').trim().slice(0, SNAPSHOT_TEXT_MAX_LENGTH),
  }
}

function buildEvent(
  type: ActionType,
  target: Element,
  payload?: Record<string, unknown>,
  composedPath?: readonly EventTarget[],
): CapturedEvent {
  const shadowResult = detectShadowContext(target)
  const bundle: LocatorBundle | null = engine.evaluate(target, document, {
    shadowContext: shadowResult?.context,
    shadowClosed: shadowResult?.closed,
    frameContext: frameContext ?? undefined,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    composedPath,
    mutatedText: wasTextMutated(target),
  })
  if (shadowResult?.closed) {
    logger.warn('[CS] Element is inside a closed shadow root — locator may be unreliable', target)
  }
  return {
    type,
    target: { locatorBundle: bundle, elementSnapshot: buildSnapshot(target) },
    payload,
    timestamp: Date.now(),
    pageMetadata: { url: location.href, title: document.title },
  }
}

function buildWaitEvent(reason: IRWaitReason, target: Element | null): CapturedEvent {
  const wait: IRWaitInfo = { reason, timeoutMs: AUTO_WAIT_DEFAULT_TIMEOUT_MS }
  if (target) {
    const shadowResult = detectShadowContext(target)
    const bundle: LocatorBundle | null = engine.evaluate(target, document, {
      shadowContext: shadowResult?.context,
      shadowClosed: shadowResult?.closed,
      frameContext: frameContext ?? undefined,
    })
    return {
      type: 'wait',
      target: { locatorBundle: bundle, elementSnapshot: buildSnapshot(target) },
      payload: { wait },
      timestamp: Date.now(),
      pageMetadata: { url: location.href, title: document.title },
    }
  }
  return {
    type: 'wait',
    target: null,
    payload: { wait },
    timestamp: Date.now(),
    pageMetadata: { url: location.href, title: document.title },
  }
}

let activeSessionId: string | null = null
/** Most recent post-click network event timestamp; reset per click watch. */
let networkActivityCounter = 0
/** AbortController for the in-flight post-click wait detection, if any. */
let pendingWaitAbort: AbortController | null = null

async function watchForWait(sessionId: string): Promise<void> {
  // Cancel any prior watch — only the latest click matters.
  pendingWaitAbort?.abort()
  const ctrl = new AbortController()
  pendingWaitAbort = ctrl
  const networkBefore = networkActivityCounter

  const spinner = await observeForSpinner({ timeoutMs: AUTO_WAIT_NETWORK_DEBOUNCE_MS }, ctrl.signal)

  if (ctrl.signal.aborted) return

  let event: CapturedEvent | null = null
  if (spinner) {
    // Spinner wins — it's a more specific cue than networkidle.
    event = buildWaitEvent('spinner', spinner)
  } else if (networkActivityCounter > networkBefore) {
    event = buildWaitEvent('networkidle', null)
  }

  if (!event || ctrl.signal.aborted) return
  if (pendingWaitAbort === ctrl) pendingWaitAbort = null
  await sendToBackground({ type: 'EVENT_CAPTURED', sessionId, event }).catch((err) =>
    logger.error('[CS] Failed to send wait EVENT_CAPTURED', err),
  )
}

/**
 * The real click target. Inside an OPEN shadow root the browser retargets
 * `event.target` to the host at each boundary, so `composedPath()[0]` — the
 * deepest node the event actually started on — is the element the user clicked.
 * Falls back to `event.target` when the path is empty (synthetic events).
 */
export function realTargetFromEvent(e: {
  composedPath(): readonly EventTarget[]
  target: EventTarget | null
}): Element | null {
  const first = e.composedPath()[0]
  if (first instanceof Element) return first
  return e.target instanceof Element ? e.target : null
}

function hasToggleType(input: HTMLInputElement): boolean {
  return input.type === 'checkbox' || input.type === 'radio'
}

function isToggleInput(el: Element | null | undefined): el is HTMLInputElement {
  return el instanceof HTMLInputElement && hasToggleType(el)
}

/**
 * True when the click lands on a `<label>` whose checkbox/radio will receive its
 * own synthetic click right after — recording both would double the step.
 */
function isLabelForwardingToToggle(target: Element): boolean {
  const label = target.closest('label')
  return (
    Boolean(label && label !== target && isToggleInput(label.control)) ||
    (target instanceof HTMLLabelElement && isToggleInput(target.control))
  )
}

function sendCaptured(sessionId: string, event: CapturedEvent): void {
  sendToBackground({ type: 'EVENT_CAPTURED', sessionId, event }).catch((err) =>
    logger.error('[CS] Failed to send EVENT_CAPTURED', err),
  )
}

function isInHoverRevealedContent(event: CapturedEvent): boolean {
  return event.target?.locatorBundle?.edgeCases?.some((c) => c.kind === 'hover-only') ?? false
}

function recordRevealingHover(sessionId: string): void {
  const hovered = takeRevealingHover()
  if (!hovered) return
  sendCaptured(sessionId, { ...buildEvent('hover', hovered.el), timestamp: hovered.at })
}

function onMouseoverCapture(e: MouseEvent): void {
  if (!activeSessionId) return
  const path = e.composedPath()
  const realTarget = realTargetFromEvent(e)
  if (!realTarget) return
  noteHover(normalizeClickTarget(realTarget, ancestorsFromComposedPath(realTarget, path)))
}

function onClickCapture(e: MouseEvent): void {
  if (!activeSessionId) return
  const path = e.composedPath()
  const realTarget = realTargetFromEvent(e)
  if (!realTarget) return
  if (isToggleInput(realTarget)) {
    // The browser toggles `checked` before dispatching click, so it already
    // holds the post-click state; radios can only ever become checked.
    const type: ActionType = realTarget.checked ? 'check' : 'uncheck'
    sendCaptured(activeSessionId, buildEvent(type, realTarget, undefined, path))
    return
  }
  if (isLabelForwardingToToggle(realTarget)) return
  // Promote presentational leaf clicks (icon paths, card text) to the nearest
  // actionable ancestor — the element the user actually meant to target.
  const target = normalizeClickTarget(realTarget, ancestorsFromComposedPath(realTarget, path))
  const sessionId = activeSessionId
  const event = buildEvent('click', target, undefined, path)
  if (isInHoverRevealedContent(event)) recordRevealingHover(sessionId)
  sendToBackground({ type: 'EVENT_CAPTURED', sessionId, event })
    .catch((err) => logger.error('[CS] Failed to send EVENT_CAPTURED', err))
    .then(() => watchForWait(sessionId))
    .catch((err) => logger.error('[CS] watchForWait failed', err))
}

function onChangeCapture(e: Event): void {
  if (!activeSessionId) return
  const target = e.target
  if (target instanceof HTMLSelectElement) {
    const label = target.selectedOptions[0]?.text.trim()
    sendCaptured(activeSessionId, buildEvent('select', target, { value: target.value, label }))
    return
  }
  // Checkbox/radio state is recorded from the click as check/uncheck instead.
  if (!isTextField(target)) return
  const wasFlushed = flushedValues.get(target) === target.value
  flushedValues.delete(target)
  if (!wasFlushed) recordFill(activeSessionId, target)
}

function onDblclickCapture(e: MouseEvent): void {
  if (!activeSessionId) return
  const path = e.composedPath()
  const realTarget = realTargetFromEvent(e)
  if (!realTarget) return
  const target = normalizeClickTarget(realTarget, ancestorsFromComposedPath(realTarget, path))
  sendCaptured(activeSessionId, buildEvent('dblclick', target, undefined, path))
}

/** Field value as of the last recorded `fill` (or focus), to tell a pending edit from a stale one. */
const committedValues = new WeakMap<Element, string>()
/** Values already recorded by a keydown flush, so the `change` that follows is not recorded twice. */
const flushedValues = new WeakMap<Element, string>()

type TextField = HTMLInputElement | HTMLTextAreaElement

function isTextField(el: EventTarget | null): el is TextField {
  if (el instanceof HTMLTextAreaElement) return true
  return el instanceof HTMLInputElement && !hasToggleType(el)
}

function onFocusinCapture(e: FocusEvent): void {
  if (isTextField(e.target)) committedValues.set(e.target, e.target.value)
}

function recordFill(sessionId: string, field: TextField): void {
  committedValues.set(field, field.value)
  sendCaptured(sessionId, buildEvent('fill', field, { value: field.value }))
}

/**
 * Browsers fire `change` after the keydown that commits a field (Enter, or the Tab that blurs
 * it), so without this the recording would read keypress → fill instead of fill → keypress.
 */
function flushPendingFill(sessionId: string, target: Element): void {
  if (!isTextField(target)) return
  if (target.value === (committedValues.get(target) ?? target.defaultValue)) return
  recordFill(sessionId, target)
  flushedValues.set(target, target.value)
}

function isEnterActivated(target: Element): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  if (target.closest('summary, [role="button"]')) return true
  return (
    target instanceof HTMLInputElement &&
    (ENTER_ACTIVATED_INPUT_TYPES as readonly string[]).includes(target.type)
  )
}

function isRecordedKey(key: string): key is (typeof RECORDED_KEYS)[number] {
  return (RECORDED_KEYS as readonly string[]).includes(key)
}

function onKeydownCapture(e: KeyboardEvent): void {
  if (!activeSessionId) return
  if (!isRecordedKey(e.key)) return
  if (e.isComposing || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
  const target = realTargetFromEvent(e)
  if (!target) return
  if (e.key === 'Enter' && isEnterActivated(target)) return
  flushPendingFill(activeSessionId, target)
  sendCaptured(activeSessionId, buildEvent('keypress', target, { key: e.key }, e.composedPath()))
}

function onNetworkCapture(e: Event): void {
  if (!activeSessionId) return
  const detail = (e as CustomEvent<NetworkPayload>).detail
  if (!detail || !detail.url || !detail.method) return
  // Bump the counter regardless of whether the user wants mocks — the wait
  // watcher needs to know there *was* network activity within the window.
  networkActivityCounter += 1
  const sessionId = activeSessionId
  const event: CapturedEvent = {
    type: 'network',
    target: null,
    payload: { ...detail },
    timestamp: Date.now(),
    pageMetadata: { url: location.href, title: document.title },
  }
  sendToBackground({ type: 'EVENT_CAPTURED', sessionId, event }).catch((err) =>
    logger.error('[CS] Failed to send network EVENT_CAPTURED', err),
  )
}

export function startCapture(sessionId: string): void {
  activeSessionId = sessionId
  setPageFlag(NETWORK_CAPTURE_FLAG_KEY, true)
  startTextMutationTracking()
  startHoverTracking()
  document.addEventListener('mouseover', onMouseoverCapture, { capture: true })
  document.addEventListener('click', onClickCapture, { capture: true })
  document.addEventListener('change', onChangeCapture, { capture: true })
  document.addEventListener('dblclick', onDblclickCapture, { capture: true })
  document.addEventListener('keydown', onKeydownCapture, { capture: true })
  document.addEventListener('focusin', onFocusinCapture, { capture: true })
  window.addEventListener(NETWORK_CAPTURE_EVENT_NAME, onNetworkCapture as EventListener)
  logger.info('[CS] Capture started', sessionId)
}

export function stopCapture(): void {
  activeSessionId = null
  // Both flags only mean something while recording; a stale one would keep the MAIN-world
  // proxies active on this origin after the session ended.
  setPageFlag(NETWORK_CAPTURE_FLAG_KEY, false)
  setPageFlag(PIERCE_CLOSED_SHADOW_FLAG_KEY, false)
  pendingWaitAbort?.abort()
  pendingWaitAbort = null
  stopTextMutationTracking()
  stopHoverTracking()
  document.removeEventListener('mouseover', onMouseoverCapture, { capture: true })
  document.removeEventListener('click', onClickCapture, { capture: true })
  document.removeEventListener('change', onChangeCapture, { capture: true })
  document.removeEventListener('dblclick', onDblclickCapture, { capture: true })
  document.removeEventListener('keydown', onKeydownCapture, { capture: true })
  document.removeEventListener('focusin', onFocusinCapture, { capture: true })
  window.removeEventListener(NETWORK_CAPTURE_EVENT_NAME, onNetworkCapture as EventListener)
  logger.info('[CS] Capture stopped')
}
