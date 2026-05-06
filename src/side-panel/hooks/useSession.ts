import { useEffect, useCallback, useState } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'
import type { AssertionSuggestion } from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import type { ElementSnapshot } from '@shared/types/action'

interface AssertionContext {
  suggestions: AssertionSuggestion[]
  locatorBundle: LocatorBundle | null
  elementSnapshot: ElementSnapshot
  pageMetadata: { url: string; title: string }
}

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

  const [isProbeActive, setIsProbeActive] = useState(false)
  const [assertionContext, setAssertionContext] = useState<AssertionContext | null>(null)

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
      } else if (message.type === 'ASSERTION_SUGGESTIONS') {
        setIsProbeActive(false)
        setAssertionContext({
          suggestions: message.suggestions,
          locatorBundle: message.locatorBundle,
          elementSnapshot: message.elementSnapshot,
          pageMetadata: message.pageMetadata,
        })
      }
    })
    return cleanup
  }, [appendStep, setActiveSession, setGeneratedCode, setCodeGenError])

  const [isStarting, setIsStarting] = useState(false)

  const toggleAssertionProbe = useCallback(async () => {
    if (!activeSession) return
    if (isProbeActive) {
      setIsProbeActive(false)
      await sendToBackground({ type: 'ASSERTION_PROBE_STOP', sessionId: activeSession.sessionId })
    } else {
      setIsProbeActive(true)
      await sendToBackground({ type: 'ASSERTION_PROBE_START', sessionId: activeSession.sessionId })
    }
  }, [activeSession, isProbeActive])

  const cancelAssertionBuilder = useCallback(() => {
    setAssertionContext(null)
  }, [])

  const addAssertion = useCallback(
    async (
      suggestion: AssertionSuggestion,
      locatorBundle: LocatorBundle | null,
      elementSnapshot: ElementSnapshot,
      pageMetadata: { url: string; title: string },
      customExpected?: string,
    ) => {
      if (!activeSession) return
      setAssertionContext(null)
      await sendToBackground({
        type: 'ASSERTION_ADD',
        sessionId: activeSession.sessionId,
        suggestion,
        customExpected,
        locatorBundle,
        elementSnapshot,
        pageMetadata,
      })
    },
    [activeSession],
  )

  const startRecording = useCallback(async () => {
    if (isStarting) return
    setIsStarting(true)
    try {
      // Side panel runs in an extension context; `currentWindow` can resolve to the
      // extension window instead of the browser window. Use getLastFocused with
      // windowTypes: ['normal'] to reliably find the user-facing browser window.
      let tab: chrome.tabs.Tab | undefined
      try {
        const win = await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] })
        tab = win.tabs?.find((t) => t.active)
      } catch {
        // Fallback for environments where getLastFocused is unavailable
        const [fallbackTab] = await chrome.tabs.query({ active: true, currentWindow: true })
        tab = fallbackTab
      }
      if (!tab?.id) {
        setCodeGenError('Could not find an active browser tab. Please click on the page first.')
        return
      }
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
    } finally {
      setIsStarting(false)
    }
  }, [isStarting, clearSteps, setGeneratedCode, setCodeGenError])

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
    isStarting,
    generatedCode,
    codeGenError,
    isProbeActive,
    assertionContext,
    startRecording,
    stopRecording,
    generateCode,
    deleteStep,
    toggleAssertionProbe,
    cancelAssertionBuilder,
    addAssertion,
  }
}
