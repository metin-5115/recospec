import { useEffect, useCallback } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'

export function useSession() {
  const {
    activeSession,
    steps,
    generatedCode,
    setActiveSession,
    appendStep,
    clearSteps,
    setGeneratedCode,
  } = useSessionStore()

  useEffect(() => {
    const cleanup = onUIMessage((message) => {
      if (message.type === 'STEP_RECORDED') {
        appendStep(message.step)
      } else if (message.type === 'SESSION_STATE_CHANGED') {
        // Keep the session object even when stopped so generateCode can use its sessionId.
        // isRecording checks session.state === 'recording', not whether activeSession is null.
        setActiveSession(message.session)
      } else if (message.type === 'CODE_GENERATED') {
        setGeneratedCode(message.code)
      }
    })
    return cleanup
  }, [appendStep, setActiveSession, setGeneratedCode])

  const startRecording = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    clearSteps()
    setGeneratedCode(null)
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
  }, [clearSteps, setGeneratedCode])

  const stopRecording = useCallback(async () => {
    if (!activeSession) return
    await sendToBackground({ type: 'SESSION_STOP', sessionId: activeSession.sessionId })
  }, [activeSession])

  const generateCode = useCallback(async () => {
    if (!activeSession) return
    await sendToBackground({
      type: 'CODE_GENERATE',
      sessionId: activeSession.sessionId,
      framework: 'playwright-ts',
    })
  }, [activeSession])

  const isRecording = activeSession?.state === 'recording'

  return {
    activeSession,
    steps,
    isRecording,
    generatedCode,
    startRecording,
    stopRecording,
    generateCode,
  }
}
