import { onBackgroundMessage } from '@shared/messaging/listen'
import { startSession, stopSession } from './session-manager'
import { aggregateEvent } from './event-aggregator'
import { handleCodeGenerate } from './codegen-orchestrator'
import {
  handleAssertionProbeStart,
  handleAssertionProbeStop,
  handleAssertionSuggestion,
  handleAssertionAdd,
} from './assertion-handler'
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

      case 'CODE_GENERATE':
        return handleCodeGenerate(message.sessionId, message.framework).catch((err) =>
          logger.error('[BG] CODE_GENERATE failed', err),
        )

      case 'ASSERTION_PROBE_START':
        return handleAssertionProbeStart(message.sessionId).catch((err) =>
          logger.error('[BG] ASSERTION_PROBE_START failed', err),
        )

      case 'ASSERTION_PROBE_STOP':
        return handleAssertionProbeStop(message.sessionId).catch((err) =>
          logger.error('[BG] ASSERTION_PROBE_STOP failed', err),
        )

      case 'ASSERTION_SUGGESTION':
        return handleAssertionSuggestion(
          message.sessionId,
          message.locatorBundle,
          message.elementSnapshot,
          message.suggestions,
          message.pageMetadata,
        ).catch((err) => logger.error('[BG] ASSERTION_SUGGESTION failed', err))

      case 'ASSERTION_ADD':
        return handleAssertionAdd(
          message.sessionId,
          message.suggestion,
          message.customExpected,
          message.locatorBundle,
          message.elementSnapshot,
          message.pageMetadata,
        ).catch((err) => logger.error('[BG] ASSERTION_ADD failed', err))
    }
  })
}
