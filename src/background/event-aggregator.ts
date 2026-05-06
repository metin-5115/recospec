import type { CapturedEvent } from '@shared/types/action'
import type { RecordedAction } from '@shared/types/action'
import { appendAction, getActionsBySession } from '@storage/action-repo'
import { broadcastToUI } from '@shared/messaging/send'
import { logger } from '@shared/logger'

export async function aggregateEvent(sessionId: string, event: CapturedEvent): Promise<void> {
  const existing = await getActionsBySession(sessionId)
  const sequenceNumber = existing.length

  const bundle = event.target?.locatorBundle ?? null
  const action: RecordedAction = {
    actionId: crypto.randomUUID(),
    sessionId,
    sequenceNumber,
    type: event.type,
    timestamp: event.timestamp,
    pageUrl: event.pageMetadata.url,
    pageTitle: event.pageMetadata.title || undefined,
    target: bundle
      ? {
          primaryLocator: bundle.primary,
          fallbackLocators: bundle.fallbacks,
          elementSnapshot: event.target!.elementSnapshot,
        }
      : undefined,
    elementSnapshot: event.target?.elementSnapshot,
    payload: event.payload,
  }

  await appendAction(action)
  await broadcastToUI({ type: 'STEP_RECORDED', sessionId, step: action })
  logger.debug('[BG] Step recorded', action.actionId, action.type)
}
