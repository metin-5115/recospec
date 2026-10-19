import type { ElementSnapshot, AssertionSuggestion } from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import { LocatorEngine } from '@locator/index'
import { valueAssertionSuggestions, urlAssertionSuggestion } from '@shared/assertion-suggestions'
import { slugifyKebab } from '@shared/slug'
import { detectShadowContext, detectFrameContext } from './shadow-pierce'
import { sendToBackground } from '@shared/messaging/send'
import { logger } from '@shared/logger'
import { SNAPSHOT_TEXT_MAX_LENGTH } from '@shared/constants'

const engine = new LocatorEngine()
const frameContext = detectFrameContext()

let activeSessionId: string | null = null
let overlayEl: HTMLDivElement | null = null

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

function buildSuggestions(el: Element, snapshot: ElementSnapshot): AssertionSuggestion[] {
  const suggestions: AssertionSuggestion[] = [{ type: 'visible', label: 'Expect visible' }]

  // Stable text → exact/contains; dynamic value → not-empty/contains/matches.
  const text = snapshot.textContent
  if (text) suggestions.push(...valueAssertionSuggestions(text))

  const tag = snapshot.tagName
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const value = (el as HTMLInputElement).value
    suggestions.push({ type: 'value', label: `Expect value: "${value}"`, expected: value })
  }

  suggestions.push({ type: 'hidden', label: 'Expect hidden' })
  suggestions.push({
    type: 'screenshot',
    label: 'Screenshot match',
    name: slugifyKebab(document.title, 'snapshot'),
    threshold: 0.2,
  })

  const urlSuggestion = urlAssertionSuggestion(location.href)
  if (urlSuggestion) suggestions.push(urlSuggestion)

  return suggestions
}

/** Element the overlay should cover; applied once per frame however many mouseovers arrive. */
let overlayTarget: Element | null = null
let isOverlayFrameScheduled = false

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div')
  overlay.style.cssText = [
    'position:fixed',
    'background:rgba(59,130,246,0.15)',
    'outline:2px solid #3b82f6',
    'pointer-events:none',
    'z-index:2147483647',
    'border-radius:2px',
    'box-sizing:border-box',
  ].join(';')
  document.body.appendChild(overlay)
  return overlay
}

function positionOverlay(): void {
  isOverlayFrameScheduled = false
  if (!overlayTarget) return
  const rect = overlayTarget.getBoundingClientRect()
  overlayEl ??= createOverlay()
  overlayEl.style.top = `${rect.top}px`
  overlayEl.style.left = `${rect.left}px`
  overlayEl.style.width = `${rect.width}px`
  overlayEl.style.height = `${rect.height}px`
}

function showOverlay(el: Element): void {
  overlayTarget = el
  if (isOverlayFrameScheduled) return
  isOverlayFrameScheduled = true
  window.requestAnimationFrame(positionOverlay)
}

function removeOverlay(): void {
  overlayTarget = null
  overlayEl?.remove()
  overlayEl = null
}

function onMouseOver(e: MouseEvent): void {
  if (!(e.target instanceof Element)) return
  showOverlay(e.target)
}

function onClickProbe(e: MouseEvent): void {
  e.preventDefault()
  e.stopImmediatePropagation()
  if (!activeSessionId || !(e.target instanceof Element)) return

  const sessionId = activeSessionId
  const el = e.target
  const snapshot = buildSnapshot(el)
  const shadowResult = detectShadowContext(el)
  const bundle: LocatorBundle | null = engine.evaluate(el, document, {
    shadowContext: shadowResult?.context,
    shadowClosed: shadowResult?.closed,
    frameContext: frameContext ?? undefined,
  })
  const suggestions = buildSuggestions(el, snapshot)

  removeOverlay()
  stopProbe()

  sendToBackground({
    type: 'ASSERTION_SUGGESTION',
    sessionId,
    locatorBundle: bundle,
    elementSnapshot: snapshot,
    suggestions,
    pageMetadata: { url: location.href, title: document.title },
  }).catch((err) => logger.error('[CS] Failed to send ASSERTION_SUGGESTION', err))
}

export function startProbe(sessionId: string): void {
  activeSessionId = sessionId
  document.addEventListener('mouseover', onMouseOver, { capture: true })
  document.addEventListener('click', onClickProbe, { capture: true })
  document.body.style.cursor = 'crosshair'
  logger.info('[CS] Assertion probe started', sessionId)
}

export function stopProbe(): void {
  activeSessionId = null
  document.removeEventListener('mouseover', onMouseOver, { capture: true })
  document.removeEventListener('click', onClickProbe, { capture: true })
  document.body.style.cursor = ''
  removeOverlay()
  logger.info('[CS] Assertion probe stopped')
}
