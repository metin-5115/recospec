import { onBackgroundMessage } from '@shared/messaging/listen'
import { startSession, stopSession } from './session-manager'
import { aggregateEvent } from './event-aggregator'
import { logger } from '@shared/logger'

export function initMessageRouter(): void {
  onBackgroundMessage((message, _sender) => {
    switch (message.type) {
      case 'SESSION_START':
        return startSession(message.tabId, message.metadata, message.config).catch((err) =>
          logger.error('[BG] SESSION_START failed', err),
        )

      case 'SESSION_STOP':
        return stopSession(message.sessionId).catch((err) =>
          logger.error('[BG] SESSION_STOP failed', err),
        )

      case 'EVENT_CAPTURED':
        return aggregateEvent(message.sessionId, message.event).catch((err) =>
          logger.error('[BG] EVENT_CAPTURED failed', err),
        )
    }
  })
}
