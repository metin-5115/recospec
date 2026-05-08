import type {
  ActionType,
  CapturedEvent,
  ElementSnapshot,
  NetworkPayload,
} from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import { LocatorEngine } from '@locator/index'
import { detectShadowContext, detectFrameContext } from './shadow-pierce'
import { sendToBackground } from '@shared/messaging/send'
import { logger } from '@shared/logger'

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
): CapturedEvent {
  const shadowResult = detectShadowContext(target)
  const bundle: LocatorBundle | null = engine.evaluate(target, document, {
    shadowContext: shadowResult?.context,
    shadowClosed: shadowResult?.closed,
    frameContext: frameContext ?? undefined,
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

let activeSessionId: string | null = null

function onClickCapture(e: MouseEvent): void {
  if (!activeSessionId || !(e.target instanceof Element)) return
  const sessionId = activeSessionId
  const event = buildEvent('click', e.target)
  sendToBackground({ type: 'EVENT_CAPTURED', sessionId, event }).catch((err) =>
    logger.error('[CS] Failed to send EVENT_CAPTURED', err),
  )
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
  document.addEventListener('click', onClickCapture, { capture: true })
  document.addEventListener('change', onChangeCapture, { capture: true })
  window.addEventListener('playforge:network', onNetworkCapture as EventListener)
  logger.info('[CS] Capture started', sessionId)
}

export function stopCapture(): void {
  activeSessionId = null
  document.removeEventListener('click', onClickCapture, { capture: true })
  document.removeEventListener('change', onChangeCapture, { capture: true })
  window.removeEventListener('playforge:network', onNetworkCapture as EventListener)
  logger.info('[CS] Capture stopped')
}
