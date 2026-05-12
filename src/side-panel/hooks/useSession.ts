import { useEffect, useCallback, useMemo, useState } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'
import { listSessions } from '@storage/session-repo'
import { getActionsBySession } from '@storage/action-repo'
import { downloadJsonExport } from '@codegen/export/json-export'
import { downloadZipExport } from '@codegen/export/zip-export'
import { generate } from '@codegen/index'
import { LOCATOR_VALIDATION_MAX_TARGETS } from '@shared/constants'
import type { AssertionSuggestion } from '@shared/types/action'
import type { LocatorBundle, ScoredLocator } from '@shared/types/locator'
import type { ElementSnapshot, RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'
import type { TestDataConfig } from '@codegen/ir/types'
import type { LocatorValidationResult, LocatorValidationTarget } from '@shared/types/messages'

interface AssertionContext {
  suggestions: AssertionSuggestion[]
  locatorBundle: LocatorBundle | null
  elementSnapshot: ElementSnapshot
  pageMetadata: { url: string; title: string }
  screenshotDataUrl?: string
}

const MAX_RETRIES = 3

export function useSession() {
  const {
    activeSession,
    steps,
    generatedCode,
    codeGenError,
    stepsDirty,
    sessions,
    selectedFramework,
    autoWaitEnabled,
    setActiveSession,
    appendStep,
    deleteStep,
    reorderSteps,
    updateStep,
    setStepLocator,
    syncSteps,
    clearSteps,
    setGeneratedCode,
    setCodeGenError,
    setSessions,
    upsertSession,
    removeSession,
    setSelectedFramework,
    setAutoWaitEnabled,
  } = useSessionStore()

  const [isProbeActive, setIsProbeActive] = useState(false)
  const [assertionContext, setAssertionContext] = useState<AssertionContext | null>(null)
  const [includeMocks, setIncludeMocks] = useState(false)
  const [methodRenames, setMethodRenames] = useState<Record<string, string>>({})
  const [testData, setTestData] = useState<TestDataConfig>({ params: [] })
  const [validationResults, setValidationResults] = useState<LocatorValidationResult[]>([])
  const [validationDurationMs, setValidationDurationMs] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validationTruncated, setValidationTruncated] = useState<number | undefined>(undefined)
  const [isValidating, setIsValidating] = useState(false)

  const renameMethod = useCallback((key: string, value: string) => {
    setMethodRenames((prev) => ({ ...prev, [key]: value }))
  }, [])

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
      } else if (message.type === 'STEPS_SYNCED') {
        syncSteps(message.steps)
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
          screenshotDataUrl: message.screenshotDataUrl,
        })
      } else if (message.type === 'LOCATOR_VALIDATION_RESULT') {
        setIsValidating(false)
        setValidationResults(message.results)
        setValidationDurationMs(message.durationMs)
        setValidationError(message.error ?? null)
        setValidationTruncated(message.truncated)
      }
    })
    return cleanup
  }, [
    appendStep,
    syncSteps,
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
          framework: selectedFramework,
          includeMocks,
          autoWaitEnabled,
          methodRenames,
          testData,
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
  }, [
    activeSession,
    selectedFramework,
    includeMocks,
    autoWaitEnabled,
    methodRenames,
    testData,
    setCodeGenError,
  ])

  const handleDeleteStep = useCallback(
    async (actionId: string) => {
      // Optimistic UI update; backend persists + broadcasts STEPS_SYNCED to reconcile.
      deleteStep(actionId)
      if (activeSession && activeSession.state !== 'recording') {
        await sendToBackground({
          type: 'STEP_DELETED',
          sessionId: activeSession.sessionId,
          actionId,
        })
      }
    },
    [activeSession, deleteStep],
  )

  const handleReorderStep = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!activeSession) return
      if (activeSession.state === 'recording') return
      const orderedActionIds = reorderSteps(fromIndex, toIndex)
      await sendToBackground({
        type: 'STEPS_REORDERED',
        sessionId: activeSession.sessionId,
        orderedActionIds,
      })
    },
    [activeSession, reorderSteps],
  )

  const handleUpdateStep = useCallback(
    async (actionId: string, patch: Parameters<typeof updateStep>[1]) => {
      if (!activeSession) return
      if (activeSession.state === 'recording') return
      updateStep(actionId, patch)
      await sendToBackground({
        type: 'STEP_UPDATED',
        sessionId: activeSession.sessionId,
        actionId,
        patch,
      })
    },
    [activeSession, updateStep],
  )

  const buildValidationTargets = useCallback(
    (allSteps: RecordedAction[]): LocatorValidationTarget[] => {
      const targets: LocatorValidationTarget[] = []
      allSteps.forEach((step, index) => {
        if (!step.target) return
        const label =
          step.annotation ||
          step.target.elementSnapshot.textContent?.trim() ||
          step.target.elementSnapshot.tagName ||
          step.type
        targets.push({
          actionId: step.actionId,
          index,
          label: label.slice(0, 60),
          primary: step.target.primaryLocator,
          fallbacks: step.target.fallbackLocators,
          shadowContext: step.target.shadowContext,
          frameContext: step.target.frameContext,
        })
      })
      return targets
    },
    [],
  )

  const validateLocators = useCallback(async () => {
    if (!activeSession) return
    const targets = buildValidationTargets(steps)
    if (targets.length === 0) {
      setValidationResults([])
      setValidationError('No steps with captured locators to validate.')
      return
    }
    setIsValidating(true)
    setValidationError(null)
    setValidationTruncated(
      targets.length > LOCATOR_VALIDATION_MAX_TARGETS ? targets.length : undefined,
    )
    await sendToBackground({
      type: 'VALIDATE_LOCATORS',
      sessionId: activeSession.sessionId,
      recordedUrl: activeSession.startUrl,
      targets,
    })
  }, [activeSession, steps, buildValidationTargets])

  const showLocatorOnPage = useCallback(
    async (result: LocatorValidationResult) => {
      if (!activeSession) return
      const step = steps.find((s) => s.actionId === result.actionId)
      if (!step?.target) return
      await sendToBackground({
        type: 'HIGHLIGHT_LOCATOR',
        sessionId: activeSession.sessionId,
        locator: step.target.primaryLocator,
        shadowContext: step.target.shadowContext,
        frameContext: step.target.frameContext,
        label: result.label,
      })
    },
    [activeSession, steps],
  )

  const validationStats = useMemo(() => {
    const matched = validationResults.filter((r) => r.primary.status === 'matched').length
    return { matched, total: validationResults.length }
  }, [validationResults])

  const handleSetStepLocator = useCallback(
    async (actionId: string, candidate: ScoredLocator) => {
      if (!activeSession) return
      if (activeSession.state === 'recording') return
      const patch = setStepLocator(actionId, candidate)
      if (!patch) return
      await sendToBackground({
        type: 'STEP_UPDATED',
        sessionId: activeSession.sessionId,
        actionId,
        patch,
      })
    },
    [activeSession, setStepLocator],
  )

  const useFallbackLocator = useCallback(
    async (result: LocatorValidationResult, fallbackIndex: number) => {
      const step = steps.find((s) => s.actionId === result.actionId)
      if (!step?.target) return
      const fallback = step.target.fallbackLocators[fallbackIndex]
      if (!fallback) return
      await handleSetStepLocator(result.actionId, fallback)
    },
    [steps, handleSetStepLocator],
  )

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
        const code = await generate(sessionId, selectedFramework, {
          includeMocks,
          methodRenames,
          autoWaitEnabled,
          testData,
        })
        await downloadZipExport(session, code)
      } catch (err) {
        setCodeGenError(err instanceof Error ? err.message : 'ZIP export failed')
      }
    },
    [
      sessions,
      selectedFramework,
      includeMocks,
      autoWaitEnabled,
      methodRenames,
      testData,
      setCodeGenError,
    ],
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
    stepsDirty,
    isProbeActive,
    assertionContext,
    selectedFramework,
    setSelectedFramework,
    autoWaitEnabled,
    setAutoWaitEnabled,
    includeMocks,
    setIncludeMocks,
    methodRenames,
    renameMethod,
    testData,
    setTestData,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    generateCode,
    deleteStep: handleDeleteStep,
    reorderStep: handleReorderStep,
    updateStep: handleUpdateStep,
    setStepLocator: handleSetStepLocator,
    toggleAssertionProbe,
    cancelAssertionBuilder,
    addAssertion,
    loadSession,
    handleDeleteSession,
    handleRenameSession,
    exportJson,
    exportZip,
    validationResults,
    validationDurationMs,
    validationError,
    validationTruncated,
    validationStats,
    isValidating,
    validateLocators,
    showLocatorOnPage,
    useFallbackLocator,
  }
}
