import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'
import { listSessions } from '@storage/session-repo'
import { getActionsBySession } from '@storage/action-repo'
import { downloadJsonExport } from '@codegen/export/json-export'
import { downloadZipExport } from '@codegen/export/zip-export'
import { generate } from '@codegen/index'
import { isEmptySelection } from '@shared/types/generated'
import { LOCATOR_VALIDATION_MAX_TARGETS } from '@shared/constants'
import {
  ContentScriptMissingError,
  IndexedDBQuotaError,
  ServiceWorkerColdError,
  isPortDisconnectedError,
} from '@shared/errors'
import { suggestionsForSnapshot } from '@shared/assertion-suggestions'
import type { AssertionSuggestion } from '@shared/types/action'
import type { LocatorBundle, ScoredLocator } from '@shared/types/locator'
import type { ElementSnapshot, RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'
import type { TestDataConfig, TemplateParamMode } from '@codegen/ir/types'
import type { ComposedParamMode } from '@codegen/planner/template-modes'
import type { LocatorValidationResult, LocatorValidationTarget } from '@shared/types/messages'

export type ReplayResultStatus = 'running' | 'pass' | 'fail' | 'skipped'

export interface ReplayState {
  running: boolean
  totalSteps: number
  passed: number
  failed: number
  skipped: number
  currentActionId: string | null
  results: Record<string, ReplayResultStatus>
  aborted: boolean
  error: string | null
}

const initialReplayState: ReplayState = {
  running: false,
  totalSteps: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  currentActionId: null,
  results: {},
  aborted: false,
  error: null,
}

interface AssertionContext {
  suggestions: AssertionSuggestion[]
  locatorBundle: LocatorBundle | null
  elementSnapshot: ElementSnapshot
  pageMetadata: { url: string; title: string }
  screenshotDataUrl?: string
  /** Set when the builder was opened from a stopped step row, not the live probe. */
  afterActionId?: string
}

interface IterationSuggestion {
  sessionId: string
  parentSessionId: string
  parentName: string
  parentIterationNumber: number
  parentTimestamp: number
}

interface DiffSelection {
  sessionA: Session
  actionsA: RecordedAction[]
  sessionB: Session
  actionsB: RecordedAction[]
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
    bddEnabled,
    includeMocks,
    pierceClosedShadow,
    outputSelection,
    asyncError,
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
    setBddEnabled,
    setIncludeMocks,
    setOutputSelection,
    setAsyncError,
  } = useSessionStore()

  const [isProbeActive, setIsProbeActive] = useState(false)
  const [assertionContext, setAssertionContext] = useState<AssertionContext | null>(null)
  const [methodRenames, setMethodRenames] = useState<Record<string, string>>({})
  const [testData, setTestData] = useState<TestDataConfig>({ params: [] })
  // Per-element render modes for dynamic-content locators, keyed by the
  // element's locator string (== IR `locatorValue`). Drive the inline
  // "Sabit ad ↔ Parametre" toggle on container/template steps.
  const [composedModes, setComposedModes] = useState<Record<string, ComposedParamMode>>({})
  const [templateModes, setTemplateModes] = useState<Record<string, TemplateParamMode>>({})
  const [validationResults, setValidationResults] = useState<LocatorValidationResult[]>([])
  const [validationDurationMs, setValidationDurationMs] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validationTruncated, setValidationTruncated] = useState<number | undefined>(undefined)
  const [isValidating, setIsValidating] = useState(false)
  const [iterationSuggestion, setIterationSuggestion] = useState<IterationSuggestion | null>(null)
  const [diffSelection, setDiffSelection] = useState<DiffSelection | null>(null)
  const [lastStepId, setLastStepId] = useState<string | null>(null)
  const [replayState, setReplayState] = useState<ReplayState>(initialReplayState)
  const flashTimerRef = useRef<number | null>(null)

  const renameMethod = useCallback((key: string, value: string) => {
    setMethodRenames((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setComposedMode = useCallback((key: string, mode: ComposedParamMode) => {
    setComposedModes((prev) => ({ ...prev, [key]: mode }))
  }, [])

  const setTemplateMode = useCallback((key: string, mode: TemplateParamMode) => {
    setTemplateModes((prev) => ({ ...prev, [key]: mode }))
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
        if (flashTimerRef.current !== null) {
          window.clearTimeout(flashTimerRef.current)
        }
        setLastStepId(message.step.actionId)
        flashTimerRef.current = window.setTimeout(() => {
          setLastStepId(null)
          flashTimerRef.current = null
        }, 800)
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
      } else if (message.type === 'SESSION_ITERATION_SUGGESTED') {
        setIterationSuggestion({
          sessionId: message.sessionId,
          parentSessionId: message.parentSessionId,
          parentName: message.parentName,
          parentIterationNumber: message.parentIterationNumber,
          parentTimestamp: message.parentTimestamp,
        })
      } else if (message.type === 'STORAGE_QUOTA_EXCEEDED') {
        setAsyncError(new IndexedDBQuotaError())
      } else if (message.type === 'REPLAY_STARTED') {
        setReplayState({
          ...initialReplayState,
          running: true,
          totalSteps: message.totalSteps,
        })
      } else if (message.type === 'REPLAY_STEP_STARTED') {
        setReplayState((prev) => ({
          ...prev,
          currentActionId: message.actionId,
          results: { ...prev.results, [message.actionId]: 'running' },
        }))
      } else if (message.type === 'REPLAY_STEP_RESULT') {
        setReplayState((prev) => ({
          ...prev,
          results: { ...prev.results, [message.actionId]: message.status },
          passed: prev.passed + (message.status === 'pass' ? 1 : 0),
          failed: prev.failed + (message.status === 'fail' ? 1 : 0),
          skipped: prev.skipped + (message.status === 'skipped' ? 1 : 0),
        }))
      } else if (message.type === 'REPLAY_DONE') {
        setReplayState((prev) => ({
          ...prev,
          running: false,
          currentActionId: null,
          aborted: message.aborted ?? false,
          error: message.error ?? null,
        }))
      }
    })
    return () => {
      cleanup()
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current)
        flashTimerRef.current = null
      }
    }
  }, [
    appendStep,
    syncSteps,
    setActiveSession,
    setGeneratedCode,
    setCodeGenError,
    upsertSession,
    removeSession,
    setAsyncError,
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
      afterActionId?: string,
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
        afterActionId,
      })
    },
    [activeSession],
  )

  /**
   * Open the AssertionBuilder seeded from a stopped step. The element
   * snapshot + recorded locators live on the action itself, so we can build
   * suggestions without re-probing the live page.
   */
  const openAssertionForStep = useCallback(
    (actionId: string) => {
      if (!activeSession) return
      const step = steps.find((s) => s.actionId === actionId)
      if (!step?.target?.elementSnapshot) return
      const snapshot = step.target.elementSnapshot
      const value = (step.payload?.value as string | undefined) ?? undefined
      const suggestions = suggestionsForSnapshot(snapshot, step.pageTitle ?? '', value)
      const bundle: LocatorBundle = {
        primary: step.target.primaryLocator,
        fallbacks: step.target.fallbackLocators,
        rejected: [],
        allCandidates: step.target.allCandidates ?? [
          step.target.primaryLocator,
          ...step.target.fallbackLocators,
        ],
      }
      setAssertionContext({
        suggestions,
        locatorBundle: bundle,
        elementSnapshot: snapshot,
        pageMetadata: { url: step.pageUrl, title: step.pageTitle ?? '' },
        afterActionId: actionId,
      })
    },
    [activeSession, steps],
  )

  const replayCurrentSession = useCallback(async () => {
    if (!activeSession) return
    if (replayState.running) return
    if (steps.length === 0) return
    setReplayState({ ...initialReplayState, running: true, totalSteps: steps.length })
    await sendToBackground({ type: 'REPLAY_REQUEST', sessionId: activeSession.sessionId })
  }, [activeSession, replayState.running, steps.length])

  const abortReplay = useCallback(async () => {
    if (!activeSession || !replayState.running) return
    await sendToBackground({ type: 'REPLAY_ABORT', sessionId: activeSession.sessionId })
  }, [activeSession, replayState.running])

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

      // Strict send — chrome.runtime.sendMessage rejects with "Receiving end
      // does not exist" when the SW is dead. We surface that through the
      // typed boundary so the retry CTA can wake the worker via PING.
      try {
        await chrome.runtime.sendMessage({
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
            pierceClosedShadow,
          },
        })
      } catch (err) {
        if (isPortDisconnectedError(err)) {
          setAsyncError(new ServiceWorkerColdError(err))
          return
        }
        throw err
      }

      // Probe the content script. `chrome.tabs.sendMessage` rejects with
      // "Receiving end does not exist" only when no listener exists in the
      // tab — i.e. the recorder content script never loaded (chrome:// page,
      // extension was just reloaded, etc.). Live tabs answer with undefined.
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'PROBE' })
      } catch (err) {
        if (isPortDisconnectedError(err)) {
          setAsyncError(new ContentScriptMissingError(tab.id, err))
        }
      }
    } finally {
      setIsStarting(false)
    }
  }, [isStarting, clearSteps, setGeneratedCode, setCodeGenError, pierceClosedShadow])

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
          bdd: bddEnabled,
          selection: outputSelection,
          composedModes,
          templateModes,
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
    bddEnabled,
    outputSelection,
    composedModes,
    templateModes,
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

  const acceptIteration = useCallback(async () => {
    if (!iterationSuggestion) return
    await sendToBackground({
      type: 'SESSION_ITERATION_ACCEPT',
      sessionId: iterationSuggestion.sessionId,
      parentSessionId: iterationSuggestion.parentSessionId,
    })
    setIterationSuggestion(null)
  }, [iterationSuggestion])

  const dismissIteration = useCallback(async () => {
    if (!iterationSuggestion) return
    await sendToBackground({
      type: 'SESSION_ITERATION_DISMISS',
      sessionId: iterationSuggestion.sessionId,
    })
    setIterationSuggestion(null)
  }, [iterationSuggestion])

  const openDiff = useCallback(async (sessionA: Session, sessionB: Session) => {
    const [actionsA, actionsB] = await Promise.all([
      getActionsBySession(sessionA.sessionId),
      getActionsBySession(sessionB.sessionId),
    ])
    setDiffSelection({ sessionA, actionsA, sessionB, actionsB })
  }, [])

  const closeDiff = useCallback(() => {
    setDiffSelection(null)
  }, [])

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
      if (isEmptySelection(outputSelection)) {
        setCodeGenError('Select at least one output (page objects, test, or scaffold) to export.')
        return
      }
      try {
        const code = await generate(sessionId, selectedFramework, {
          includeMocks,
          methodRenames,
          autoWaitEnabled,
          testData,
          bdd: bddEnabled,
          selection: outputSelection,
          composedModes,
          templateModes,
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
      bddEnabled,
      outputSelection,
      composedModes,
      templateModes,
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
    bddEnabled,
    setBddEnabled,
    includeMocks,
    setIncludeMocks,
    outputSelection,
    setOutputSelection,
    methodRenames,
    renameMethod,
    testData,
    setTestData,
    composedModes,
    templateModes,
    setComposedMode,
    setTemplateMode,
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
    iterationSuggestion,
    acceptIteration,
    dismissIteration,
    diffSelection,
    openDiff,
    closeDiff,
    lastStepId,
    asyncError,
    replayState,
    replayCurrentSession,
    abortReplay,
    openAssertionForStep,
  }
}
