import { useEffect, useCallback, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { logger } from '@shared/logger'
import { sendToBackground } from '@shared/messaging/send'
import { listSessions } from '@storage/session-repo'
import { getActionsBySession } from '@storage/action-repo'
import { downloadJsonExport } from '../download'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'

export interface IterationSuggestion {
  sessionId: string
  parentSessionId: string
  parentName: string
  parentIterationNumber: number
  parentTimestamp: number
}

export interface DiffSelection {
  sessionA: Session
  actionsA: RecordedAction[]
  sessionB: Session
  actionsB: RecordedAction[]
}

/** Saved sessions: listing, loading, renaming, deleting, JSON export, iteration suggestions and diffs. */
export function useSessionHistory() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const sessions = useSessionStore((s) => s.sessions)
  const {
    setSessions,
    removeSession,
    setActiveSession,
    clearSteps,
    setGeneratedCode,
    setCodeGenError,
  } = useSessionStore(
    useShallow((s) => ({
      setSessions: s.setSessions,
      removeSession: s.removeSession,
      setActiveSession: s.setActiveSession,
      clearSteps: s.clearSteps,
      setGeneratedCode: s.setGeneratedCode,
      setCodeGenError: s.setCodeGenError,
    })),
  )

  const [iterationSuggestion, setIterationSuggestion] = useState<IterationSuggestion | null>(null)
  const [diffSelection, setDiffSelection] = useState<DiffSelection | null>(null)

  // Load session list from DB on mount
  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((err) => logger.warn('[UI] Could not load the saved sessions', err))
  }, [setSessions])

  useEffect(
    () =>
      onUIMessage((message) => {
        if (message.type === 'SESSION_DELETED') {
          removeSession(message.sessionId)
        } else if (message.type === 'SESSION_ITERATION_SUGGESTED') {
          setIterationSuggestion({
            sessionId: message.sessionId,
            parentSessionId: message.parentSessionId,
            parentName: message.parentName,
            parentIterationNumber: message.parentIterationNumber,
            parentTimestamp: message.parentTimestamp,
          })
        }
      }),
    [removeSession],
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

  const exportJson = useCallback(async (sessionId: string) => {
    const session = useSessionStore.getState().sessions.find((s) => s.sessionId === sessionId)
    if (!session) return
    const actions = await getActionsBySession(sessionId)
    downloadJsonExport(session, actions)
  }, [])

  return {
    sessions,
    iterationSuggestion,
    diffSelection,
    acceptIteration,
    dismissIteration,
    openDiff,
    closeDiff,
    handleDeleteSession,
    handleRenameSession,
    loadSession,
    exportJson,
  }
}
