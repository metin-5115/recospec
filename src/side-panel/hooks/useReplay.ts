import { useEffect, useCallback, useState } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'

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

/** Replaying the recorded steps against the live page. */
export function useReplay() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const [replayState, setReplayState] = useState<ReplayState>(initialReplayState)

  useEffect(
    () =>
      onUIMessage((message) => {
        if (message.type === 'REPLAY_STARTED') {
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
      }),
    [],
  )

  const replayCurrentSession = useCallback(async () => {
    if (!activeSession) return
    if (replayState.running) return
    const stepCount = useSessionStore.getState().steps.length
    if (stepCount === 0) return
    setReplayState({ ...initialReplayState, running: true, totalSteps: stepCount })
    await sendToBackground({ type: 'REPLAY_REQUEST', sessionId: activeSession.sessionId })
  }, [activeSession, replayState.running])

  const abortReplay = useCallback(async () => {
    if (!activeSession || !replayState.running) return
    await sendToBackground({ type: 'REPLAY_ABORT', sessionId: activeSession.sessionId })
  }, [activeSession, replayState.running])

  return { replayState, replayCurrentSession, abortReplay }
}
