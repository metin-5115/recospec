import { useEffect, useCallback } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'

const MAX_RETRIES = 3

export function useSession() {
  const {
    activeSession,
    steps,
    generatedCode,
    codeGenError,
    setActiveSession,
    appendStep,
    deleteStep,
    clearSteps,
    setGeneratedCode,
    setCodeGenError,
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
        setCodeGenError(null)
        setGeneratedCode(message.code)
      } else if (message.type === 'CODE_GENERATE_ERROR') {
        setCodeGenError(message.error)
      }
    })
    return cleanup
  }, [appendStep, setActiveSession, setGeneratedCode, setCodeGenError])

  const startRecording = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    clearSteps()
    setGeneratedCode(null)
    setCodeGenError(null)
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
  }, [clearSteps, setGeneratedCode, setCodeGenError])

  const stopRecording = useCallback(async () => {
    if (!activeSession) return
    await sendToBackground({ type: 'SESSION_STOP', sessionId: activeSession.sessionId })
  }, [activeSession])

  const generateCode = useCallback(async () => {
    if (!activeSession) return
    setCodeGenError(null)
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await sendToBackground({
          type: 'CODE_GENERATE',
          sessionId: activeSession.sessionId,
          framework: 'playwright-ts',
        })
        return
      } catch {
        if (attempt === MAX_RETRIES - 1) {
          setCodeGenError(`Failed to reach background worker after ${MAX_RETRIES} attempts.`)
        } else {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 600))
        }
      }
    }
  }, [activeSession, setCodeGenError])

  const isRecording = activeSession?.state === 'recording'

  return {
    activeSession,
    steps,
    isRecording,
    generatedCode,
    codeGenError,
    startRecording,
    stopRecording,
    generateCode,
    deleteStep,
  }
}
