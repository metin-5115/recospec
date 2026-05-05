import { useEffect, useCallback } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'

export function useSession() {
  const { activeSession, steps, setActiveSession, appendStep, clearSteps } = useSessionStore()

  useEffect(() => {
    const cleanup = onUIMessage((message) => {
      if (message.type === 'STEP_RECORDED') {
        appendStep(message.step)
      } else if (message.type === 'SESSION_STATE_CHANGED') {
        const { session } = message
        if (session.state === 'recording') {
          setActiveSession(session)
        } else {
          setActiveSession(null)
        }
      }
    })
    return cleanup
  }, [appendStep, setActiveSession])

  const startRecording = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    await sendToBackground({
      type: 'SESSION_START',
      tabId: tab.id,
      metadata: {
        userAgent: navigator.userAgent,
        viewport: { width: window.screen.width, height: window.screen.height },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      config: {
        captureClicks: true,
        captureInputs: true,
        captureNavigation: true,
      },
    })
  }, [])

  const stopRecording = useCallback(async () => {
    if (!activeSession) return
    await sendToBackground({ type: 'SESSION_STOP', sessionId: activeSession.sessionId })
    clearSteps()
  }, [activeSession, clearSteps])

  const isRecording = activeSession?.state === 'recording'

  return { activeSession, steps, isRecording, startRecording, stopRecording }
}
