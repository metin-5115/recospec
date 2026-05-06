import { useEffect, useCallback, useState } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'
import { listSessions } from '@storage/session-repo'
import { getActionsBySession } from '@storage/action-repo'
import { downloadJsonExport } from '@codegen/export/json-export'
import { downloadZipExport } from '@codegen/export/zip-export'
import { generate } from '@codegen/index'
import type { AssertionSuggestion } from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import type { ElementSnapshot } from '@shared/types/action'
import type { Session } from '@shared/types/session'

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
    sessions,
    setActiveSession,
    appendStep,
    deleteStep,
    clearSteps,
    setGeneratedCode,
    setCodeGenError,
    setSessions,
    upsertSession,
    removeSession,
  } = useSessionStore()

  const [isProbeActive, setIsProbeActive] = useState(false)
  const [assertionContext, setAssertionContext] = useState<AssertionContext | null>(null)

  // Load session list from DB on mount
  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(() => undefined)
  }, [setSessions])

  // Listen to background broadcasts
  useEffect(() => {
    const cleanup = onUIMessage((message) => {
      if (message.type === 'STEP_RECORDED') {
        appendStep(message.step)
      } else if (message.type === 'SESSION_STATE_CHANGED') {
        setActiveSession(message.session)
        upsertSession(message.session)
      } else if (message.type === 'SESSION_DELETED') {
        removeSession(message.sessionId)
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
  }, [
    appendStep,
    setActiveSession,
    setGeneratedCode,
    setCodeGenError,
    upsertSession,
    removeSession,
  ])

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
      let tab: chrome.tabs.Tab | undefined
      try {
        const win = await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] })
        tab = win.tabs?.find((t) => t.active)
      } catch {
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

  const pauseRecording = useCallback(async () => {
    if (!activeSession) return
    await sendToBackground({ type: 'SESSION_PAUSE', sessionId: activeSession.sessionId })
  }, [activeSession])

  const resumeRecording = useCallback(async () => {
    if (!activeSession) return
    await sendToBackground({ type: 'SESSION_RESUME', sessionId: activeSession.sessionId })
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

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await sendToBackground({ type: 'SESSION_DELETE', sessionId })
      // If this was the loaded session, clear steps
      if (activeSession?.sessionId === sessionId) {
        setActiveSession(null)
        clearSteps()
        setGeneratedCode(null)
      }
    },
    [activeSession, setActiveSession, clearSteps, setGeneratedCode],
  )

  const handleRenameSession = useCallback(async (sessionId: string, name: string) => {
    await sendToBackground({ type: 'SESSION_RENAME', sessionId, name })
  }, [])

  const loadSession = useCallback(
    async (session: Session) => {
      setActiveSession(session)
      clearSteps()
      setGeneratedCode(null)
      setCodeGenError(null)
      const actions = await getActionsBySession(session.sessionId)
      // Bulk-set steps without triggering one appendStep per action
      useSessionStore.setState({ steps: actions })
    },
    [setActiveSession, clearSteps, setGeneratedCode, setCodeGenError],
  )

  const exportJson = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.sessionId === sessionId)
      if (!session) return
      const actions = await getActionsBySession(sessionId)
      downloadJsonExport(session, actions)
    },
    [sessions],
  )

  const exportZip = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.sessionId === sessionId)
      if (!session) return
      try {
        const code = await generate(sessionId, 'playwright-ts')
        await downloadZipExport(session, code)
      } catch (err) {
        setCodeGenError(err instanceof Error ? err.message : 'ZIP export failed')
      }
    },
    [sessions, setCodeGenError],
  )

  const isRecording = activeSession?.state === 'recording'
  const isPaused = activeSession?.state === 'paused'

  return {
    activeSession,
    steps,
    sessions,
    isRecording,
    isPaused,
    isStarting,
    generatedCode,
    codeGenError,
    isProbeActive,
    assertionContext,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    generateCode,
    deleteStep,
    toggleAssertionProbe,
    cancelAssertionBuilder,
    addAssertion,
    loadSession,
    handleDeleteSession,
    handleRenameSession,
    exportJson,
    exportZip,
  }
}
