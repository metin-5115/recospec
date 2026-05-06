import { logger } from '@shared/logger'
import { restoreActiveSession } from './session-manager'
import { initMessageRouter } from './message-router'

logger.info('[BG] Service worker started')

initMessageRouter()

restoreActiveSession().catch((err) => logger.error('[BG] Failed to restore session', err))
