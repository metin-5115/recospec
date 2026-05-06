import { onContentMessage } from '@shared/messaging/listen'
import { startCapture, stopCapture } from './event-capture'
import { startProbe, stopProbe } from './element-probe'
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
  }
})
