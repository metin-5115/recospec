import type { ElementSnapshot, AssertionSuggestion } from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import { LocatorEngine } from '@locator/index'
import { sendToBackground } from '@shared/messaging/send'
import { logger } from '@shared/logger'

const engine = new LocatorEngine()

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
    textContent: (el.textContent ?? '').trim().slice(0, 200),
  }
}

function buildSuggestions(el: Element, snapshot: ElementSnapshot): AssertionSuggestion[] {
  const suggestions: AssertionSuggestion[] = [{ type: 'visible', label: 'Expect visible' }]

  const text = snapshot.textContent
  if (text) {
    suggestions.push({
      type: 'text',
      label: `Expect text: "${text.slice(0, 50)}"`,
      expected: text,
    })
  }

  const tag = snapshot.tagName
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const value = (el as HTMLInputElement).value
    suggestions.push({ type: 'value', label: `Expect value: "${value}"`, expected: value })
  }

  suggestions.push({ type: 'hidden', label: 'Expect hidden' })

  return suggestions
}

function showOverlay(el: Element): void {
  removeOverlay()
  const rect = el.getBoundingClientRect()
  overlayEl = document.createElement('div')
  overlayEl.style.cssText = [
    'position:fixed',
    `top:${rect.top}px`,
    `left:${rect.left}px`,
    `width:${rect.width}px`,
    `height:${rect.height}px`,
    'background:rgba(59,130,246,0.15)',
    'outline:2px solid #3b82f6',
    'pointer-events:none',
    'z-index:2147483647',
    'border-radius:2px',
    'box-sizing:border-box',
  ].join(';')
  document.body.appendChild(overlayEl)
}

function removeOverlay(): void {
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
  const bundle: LocatorBundle | null = engine.evaluate(el, document)
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
