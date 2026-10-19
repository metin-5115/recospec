import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionStore } from '../sessionStore'
import { sendToBackground } from '@shared/messaging/send'
import type { ScoredLocator } from '@shared/types/locator'

/**
 * Pin a recorded step to a different locator candidate. Kept separate from the
 * step list so callers that only apply a locator (e.g. validation) do not
 * subscribe to every step change.
 */
export function useSetStepLocator() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const setStepLocator = useSessionStore((s) => s.setStepLocator)

  return useCallback(
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
}

/** The recorded step list and the edits a user can make to it once recording has stopped. */
export function useStepEditing() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const steps = useSessionStore((s) => s.steps)
  const stepsDirty = useSessionStore((s) => s.stepsDirty)
  const { deleteStep, reorderSteps, updateStep } = useSessionStore(
    useShallow((s) => ({
      deleteStep: s.deleteStep,
      reorderSteps: s.reorderSteps,
      updateStep: s.updateStep,
    })),
  )

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

  const handleSetStepLocator = useSetStepLocator()

  return {
    steps,
    stepsDirty,
    deleteStep: handleDeleteStep,
    reorderStep: handleReorderStep,
    updateStep: handleUpdateStep,
    setStepLocator: handleSetStepLocator,
  }
}
