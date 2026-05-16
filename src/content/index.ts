import { onContentMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'
import { startCapture, stopCapture } from './event-capture'
import { startProbe, stopProbe } from './element-probe'
import { highlightLocator, validateTargets } from './locator-validator'
import { logger } from '@shared/logger'

logger.info('[CS] Content script loaded')

onContentMessage((message) => {
  if (message.type === 'START_CAPTURE') {
    startCapture(message.sessionId)
  } else if (message.type === 'STOP_CAPTURE') {
    stopCapture()
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
  }
})
