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
import { normalizeClickTarget, ancestorsFromComposedPath } from './normalize-click-target'
import { sendToBackground } from '@shared/messaging/send'
import { logger } from '@shared/logger'
import { AUTO_WAIT_DEFAULT_TIMEOUT_MS, AUTO_WAIT_NETWORK_DEBOUNCE_MS } from '@shared/constants'

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
    textContent: (el.textContent ?? '').trim().slice(0, 200),
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

function onClickCapture(e: MouseEvent): void {
  if (!activeSessionId) return
  const path = e.composedPath()
  const realTarget = realTargetFromEvent(e)
  if (!realTarget) return
  // Promote presentational leaf clicks (icon paths, card text) to the nearest
  // actionable ancestor — the element the user actually meant to target.
  const target = normalizeClickTarget(realTarget, ancestorsFromComposedPath(realTarget, path))
  const sessionId = activeSessionId
  const event = buildEvent('click', target, undefined, path)
  sendToBackground({ type: 'EVENT_CAPTURED', sessionId, event })
    .catch((err) => logger.error('[CS] Failed to send EVENT_CAPTURED', err))
    .then(() => watchForWait(sessionId))
    .catch((err) => logger.error('[CS] watchForWait failed', err))
}

function onChangeCapture(e: Event): void {
  if (!activeSessionId || !(e.target instanceof HTMLInputElement)) return
  const sessionId = activeSessionId
  const event = buildEvent('fill', e.target, { value: e.target.value })
  sendToBackground({ type: 'EVENT_CAPTURED', sessionId, event }).catch((err) =>
    logger.error('[CS] Failed to send EVENT_CAPTURED', err),
  )
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
  startTextMutationTracking()
  document.addEventListener('click', onClickCapture, { capture: true })
  document.addEventListener('change', onChangeCapture, { capture: true })
  window.addEventListener('recospec:network', onNetworkCapture as EventListener)
  logger.info('[CS] Capture started', sessionId)
}

export function stopCapture(): void {
  activeSessionId = null
  pendingWaitAbort?.abort()
  pendingWaitAbort = null
  stopTextMutationTracking()
  document.removeEventListener('click', onClickCapture, { capture: true })
  document.removeEventListener('change', onChangeCapture, { capture: true })
  window.removeEventListener('recospec:network', onNetworkCapture as EventListener)
  logger.info('[CS] Capture stopped')
}
