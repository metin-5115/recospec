import { onContentMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'
import { startCapture, stopCapture } from './event-capture'
import { startProbe, stopProbe } from './element-probe'
import { highlightLocator, validateTargets } from './locator-validator'
import { executeReplayStep } from './replay-runner'
import { mountBadge, unmountBadge } from './recording-badge'
import { logger } from '@shared/logger'
import { PIERCE_CLOSED_SHADOW_FLAG_KEY } from '@shared/constants'

logger.info('[CS] Content script loaded')

onContentMessage((message) => {
  if (message.type === 'START_CAPTURE') {
    // Mirror the closed-shadow opt-in to a page-origin flag the MAIN-world
    // proxy reads at document_start on the NEXT navigation (it cannot reach
    // chrome.storage). Writing it now covers SPA-attached roots immediately.
    try {
      if (message.config.pierceClosedShadow) {
        window.localStorage.setItem(PIERCE_CLOSED_SHADOW_FLAG_KEY, 'true')
      } else {
        window.localStorage.removeItem(PIERCE_CLOSED_SHADOW_FLAG_KEY)
      }
    } catch {
      /* sandboxed localStorage — piercing simply stays off */
    }
    startCapture(message.sessionId)
    mountBadge()
  } else if (message.type === 'STOP_CAPTURE') {
    stopCapture()
    unmountBadge()
  } else if (message.type === 'START_ASSERTION_PROBE') {
    startProbe(message.sessionId)
  } else if (message.type === 'STOP_ASSERTION_PROBE') {
    stopProbe()
  } else if (message.type === 'VALIDATE_LOCATORS_RUN') {
    const startedAt = performance.now()
    const results = validateTargets(message.targets)
    const durationMs = Math.round(performance.now() - startedAt)
    sendToBackground({
      type: 'LOCATOR_VALIDATION_RESPONSE',
      sessionId: message.sessionId,
      results,
      durationMs,
      pageUrl: location.href,
    }).catch((err) => logger.error('[CS] Failed to send LOCATOR_VALIDATION_RESPONSE', err))
  } else if (message.type === 'HIGHLIGHT_LOCATOR_ON_PAGE') {
    highlightLocator(
      message.locator,
      message.shadowContext,
      message.frameContext,
      message.label,
      message.durationMs,
    )
  } else if (message.type === 'REPLAY_STEP_RUN') {
    const outcome = executeReplayStep({
      actionType: message.actionType,
      primary: message.primary,
      fallbacks: message.fallbacks,
      shadowContext: message.shadowContext,
      frameContext: message.frameContext,
      payload: message.payload,
    })
    sendToBackground({
      type: 'REPLAY_STEP_RESPONSE',
      sessionId: message.sessionId,
      actionId: message.actionId,
      status: outcome.status,
      error: outcome.error,
    }).catch((err) => logger.error('[CS] Failed to send REPLAY_STEP_RESPONSE', err))
  }
})

// Announce readiness AFTER the listener above is registered, so any
// START_CAPTURE the background sends back is guaranteed to be received. This is
// what lets a recording survive a full-page navigation: the freshly-injected
// content script tells the background "I'm here", and the background re-arms
// capture if this tab owns an active recording session.
sendToBackground({ type: 'CONTENT_READY', url: location.href }).catch((err) =>
  logger.error('[CS] Failed to send CONTENT_READY', err),
)
