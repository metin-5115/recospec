import { onContentMessage } from '@shared/messaging/listen'
import { startCapture, stopCapture } from './event-capture'
import { logger } from '@shared/logger'

logger.info('[CS] Content script loaded')

onContentMessage((message) => {
  if (message.type === 'START_CAPTURE') {
    startCapture(message.sessionId)
  } else if (message.type === 'STOP_CAPTURE') {
    stopCapture()
  }
})
