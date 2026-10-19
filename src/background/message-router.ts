import { onBackgroundMessage } from '@shared/messaging/listen'
import {
  startSession,
  stopSession,
  pauseSession,
  resumeSession,
  deleteSessionById,
  renameSessionById,
  resumeCaptureOnReady,
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
import { handleExportRequest } from './export-handler'
import { startReplay, abortReplay, handleReplayStepResponse } from './replay-controller'
import { logger } from '@shared/logger'
import { broadcastToUI } from '@shared/messaging/send'
import { IndexedDBQuotaError, isQuotaExceededError } from '@shared/errors'

/**
 * Wrap a handler's catch path. If the rejection originated from an
 * IndexedDB quota miss (typed {@link IndexedDBQuotaError} from the storage
 * layer, or a raw Dexie/DOMException with `name === 'QuotaExceededError'`),
 * fan out a `STORAGE_QUOTA_EXCEEDED` broadcast so the side panel can render
 * the quota recovery UI. All errors are still logged for diagnostics.
 */
function handleBgError(context: string, sessionId?: string) {
  return async (err: unknown): Promise<void> => {
    if (err instanceof IndexedDBQuotaError || isQuotaExceededError(err)) {
      await broadcastToUI({ type: 'STORAGE_QUOTA_EXCEEDED', sessionId })
    }
    logger.error(`[BG] ${context} failed`, err)
  }
}

export function initMessageRouter(): void {
  onBackgroundMessage((message, sender) => {
    switch (message.type) {
      case 'CONTENT_READY': {
        // Resume recording on the new page after a full-document navigation.
        const tabId = sender.tab?.id
        if (tabId === undefined) return undefined
        return resumeCaptureOnReady(tabId).catch(handleBgError('CONTENT_READY'))
      }

      case 'SESSION_START':
        return startSession(message.tabId, message.metadata, message.config).catch(
          handleBgError('SESSION_START'),
        )

      case 'SESSION_STOP':
        return stopSession(message.sessionId).catch(
          handleBgError('SESSION_STOP', message.sessionId),
        )

      case 'SESSION_PAUSE':
        return pauseSession(message.sessionId).catch(
          handleBgError('SESSION_PAUSE', message.sessionId),
        )

      case 'SESSION_RESUME':
        return resumeSession(message.sessionId).catch(
          handleBgError('SESSION_RESUME', message.sessionId),
        )

      case 'SESSION_DELETE':
        return deleteSessionById(message.sessionId).catch(
          handleBgError('SESSION_DELETE', message.sessionId),
        )

      case 'SESSION_RENAME':
        return renameSessionById(message.sessionId, message.name).catch(
          handleBgError('SESSION_RENAME', message.sessionId),
        )

      case 'EVENT_CAPTURED':
        return aggregateEvent(message.sessionId, message.event).catch(
          handleBgError('EVENT_CAPTURED', message.sessionId),
        )

      case 'CODE_GENERATE':
        return handleCodeGenerate(message.sessionId, message.framework, {
          includeMocks: message.includeMocks,
          finalStateAssertion: message.finalStateAssertion,
          methodRenames: message.methodRenames,
          autoWaitEnabled: message.autoWaitEnabled,
          testData: message.testData,
          bdd: message.bdd,
          selection: message.selection,
          composedModes: message.composedModes,
          templateModes: message.templateModes,
        }).catch(handleBgError('CODE_GENERATE', message.sessionId))

      case 'ASSERTION_PROBE_START':
        return handleAssertionProbeStart(message.sessionId).catch(
          handleBgError('ASSERTION_PROBE_START', message.sessionId),
        )

      case 'ASSERTION_PROBE_STOP':
        return handleAssertionProbeStop(message.sessionId).catch(
          handleBgError('ASSERTION_PROBE_STOP', message.sessionId),
        )

      case 'ASSERTION_SUGGESTION':
        return handleAssertionSuggestion(
          message.sessionId,
          message.locatorBundle,
          message.elementSnapshot,
          message.suggestions,
          message.pageMetadata,
        ).catch(handleBgError('ASSERTION_SUGGESTION', message.sessionId))

      case 'ASSERTION_ADD':
        return handleAssertionAdd(
          message.sessionId,
          message.suggestion,
          message.customExpected,
          message.locatorBundle,
          message.elementSnapshot,
          message.pageMetadata,
          message.afterActionId,
        ).catch(handleBgError('ASSERTION_ADD', message.sessionId))

      case 'REPLAY_REQUEST':
        return startReplay(message.sessionId).catch(
          handleBgError('REPLAY_REQUEST', message.sessionId),
        )

      case 'REPLAY_ABORT':
        abortReplay(message.sessionId)
        return undefined

      case 'REPLAY_STEP_RESPONSE':
        handleReplayStepResponse(message.sessionId, message.actionId, message.status, message.error)
        return undefined

      case 'STEPS_REORDERED':
        return handleStepsReordered(message.sessionId, message.orderedActionIds).catch(
          handleBgError('STEPS_REORDERED', message.sessionId),
        )

      case 'STEP_UPDATED':
        return handleStepUpdated(message.sessionId, message.actionId, message.patch).catch(
          handleBgError('STEP_UPDATED', message.sessionId),
        )

      case 'STEP_DELETED':
        return handleStepDeleted(message.sessionId, message.actionId).catch(
          handleBgError('STEP_DELETED', message.sessionId),
        )

      case 'VALIDATE_LOCATORS':
        return handleValidateLocators(
          message.sessionId,
          message.targets,
          message.recordedUrl,
        ).catch(handleBgError('VALIDATE_LOCATORS', message.sessionId))

      case 'HIGHLIGHT_LOCATOR':
        return handleHighlightLocator(
          message.sessionId,
          message.locator,
          message.shadowContext,
          message.frameContext,
          message.label,
        ).catch(handleBgError('HIGHLIGHT_LOCATOR', message.sessionId))

      case 'LOCATOR_VALIDATION_RESPONSE':
        return handleValidationResponse(
          message.sessionId,
          message.results,
          message.durationMs,
          message.pageUrl,
        ).catch(handleBgError('LOCATOR_VALIDATION_RESPONSE', message.sessionId))

      case 'SESSION_ITERATION_ACCEPT':
        return handleIterationAccept(message.sessionId, message.parentSessionId).catch(
          handleBgError('SESSION_ITERATION_ACCEPT', message.sessionId),
        )

      case 'SESSION_ITERATION_DISMISS':
        return handleIterationDismiss(message.sessionId).catch(
          handleBgError('SESSION_ITERATION_DISMISS', message.sessionId),
        )

      // The VS Code host calls `handleExportRequest` directly through the
      // SW global (`self.__recospecExport`) — see background/index.ts. The
      // case is wired here for contract symmetry and so future request/
      // response surfaces can route through the typed message bus.
      case 'EXPORT_REQUEST':
        // The current `chrome.runtime.onMessage` plumbing is fire-and-forget
        // (see `shared/messaging/listen.ts`). The VS Code host bypasses it
        // and calls `handleExportRequest` directly via `self.__recospecExport`,
        // so here we just invoke the handler for side effects and drop the
        // payload to match the void return contract.
        return handleExportRequest(message.sessionId)
          .then(() => undefined)
          .catch(handleBgError('EXPORT_REQUEST', message.sessionId))
    }
  })
}
