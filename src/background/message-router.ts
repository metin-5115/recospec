import { onBackgroundMessage } from '@shared/messaging/listen'
import {
  startSession,
  stopSession,
  pauseSession,
  resumeSession,
  deleteSessionById,
  renameSessionById,
} from './session-manager'
import { aggregateEvent } from './event-aggregator'
import { handleCodeGenerate } from './codegen-orchestrator'
import {
  handleAssertionProbeStart,
  handleAssertionProbeStop,
  handleAssertionSuggestion,
  handleAssertionAdd,
} from './assertion-handler'
import { handleStepsReordered, handleStepUpdated, handleStepDeleted } from './step-controller'
import {
  handleHighlightLocator,
  handleValidateLocators,
  handleValidationResponse,
} from './locator-validation-controller'
import { handleIterationAccept, handleIterationDismiss } from './iteration-controller'
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

      case 'SESSION_PAUSE':
        return pauseSession(message.sessionId).catch((err) =>
          logger.error('[BG] SESSION_PAUSE failed', err),
        )

      case 'SESSION_RESUME':
        return resumeSession(message.sessionId).catch((err) =>
          logger.error('[BG] SESSION_RESUME failed', err),
        )

      case 'SESSION_DELETE':
        return deleteSessionById(message.sessionId).catch((err) =>
          logger.error('[BG] SESSION_DELETE failed', err),
        )

      case 'SESSION_RENAME':
        return renameSessionById(message.sessionId, message.name).catch((err) =>
          logger.error('[BG] SESSION_RENAME failed', err),
        )

      case 'EVENT_CAPTURED':
        return aggregateEvent(message.sessionId, message.event).catch((err) =>
          logger.error('[BG] EVENT_CAPTURED failed', err),
        )

      case 'CODE_GENERATE':
        return handleCodeGenerate(message.sessionId, message.framework, {
          includeMocks: message.includeMocks,
          methodRenames: message.methodRenames,
          autoWaitEnabled: message.autoWaitEnabled,
          testData: message.testData,
          bdd: message.bdd,
        }).catch((err) => logger.error('[BG] CODE_GENERATE failed', err))

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

      case 'STEPS_REORDERED':
        return handleStepsReordered(message.sessionId, message.orderedActionIds).catch((err) =>
          logger.error('[BG] STEPS_REORDERED failed', err),
        )

      case 'STEP_UPDATED':
        return handleStepUpdated(message.sessionId, message.actionId, message.patch).catch((err) =>
          logger.error('[BG] STEP_UPDATED failed', err),
        )

      case 'STEP_DELETED':
        return handleStepDeleted(message.sessionId, message.actionId).catch((err) =>
          logger.error('[BG] STEP_DELETED failed', err),
        )

      case 'VALIDATE_LOCATORS':
        return handleValidateLocators(
          message.sessionId,
          message.targets,
          message.recordedUrl,
        ).catch((err) => logger.error('[BG] VALIDATE_LOCATORS failed', err))

      case 'HIGHLIGHT_LOCATOR':
        return handleHighlightLocator(
          message.sessionId,
          message.locator,
          message.shadowContext,
          message.frameContext,
          message.label,
        ).catch((err) => logger.error('[BG] HIGHLIGHT_LOCATOR failed', err))

      case 'LOCATOR_VALIDATION_RESPONSE':
        return handleValidationResponse(
          message.sessionId,
          message.results,
          message.durationMs,
          message.pageUrl,
        ).catch((err) => logger.error('[BG] LOCATOR_VALIDATION_RESPONSE failed', err))

      case 'SESSION_ITERATION_ACCEPT':
        return handleIterationAccept(message.sessionId, message.parentSessionId).catch((err) =>
          logger.error('[BG] SESSION_ITERATION_ACCEPT failed', err),
        )

      case 'SESSION_ITERATION_DISMISS':
        return handleIterationDismiss(message.sessionId).catch((err) =>
          logger.error('[BG] SESSION_ITERATION_DISMISS failed', err),
        )
    }
  })
}
