import { memo, useCallback } from 'react'
import { useSessionStore } from '../sessionStore'
import { useStepEditing } from '../hooks/useStepEditing'
import type { ReplayState } from '../hooks/useSession'
import type { ScoredLocator } from '@shared/types/locator'
import type { StepPatch, LocatorValidationResult } from '@shared/types/messages'
import type { TemplateParamMode } from '@codegen/ir/types'
import type { ComposedParamMode } from '@codegen/planner/template-modes'
import { StepList } from '../components/StepList'

interface StepsTabProps {
  isActive: boolean
  flashStepId: string | null
  replayState: ReplayState
  validationResults: LocatorValidationResult[]
  composedModes: Record<string, ComposedParamMode>
  templateModes: Record<string, TemplateParamMode>
  onSetComposedMode: (key: string, mode: ComposedParamMode) => void
  onSetTemplateMode: (key: string, mode: TemplateParamMode) => void
  onAddAssertion: (actionId: string) => void
}

/** The recorded steps. Owns the step list and its edits; every handler it hands down is stable. */
export const StepsTab = memo(function StepsTab({
  isActive,
  flashStepId,
  replayState,
  validationResults,
  composedModes,
  templateModes,
  onSetComposedMode,
  onSetTemplateMode,
  onAddAssertion,
}: StepsTabProps) {
  const steps = useSessionStore((s) => s.steps)
  const hasActiveSession = useSessionStore((s) => s.activeSession !== null)
  const hasSessions = useSessionStore((s) => s.sessions.length > 0)
  const { deleteStep, reorderStep, updateStep, setStepLocator } = useStepEditing()

  const handleDelete = useCallback((id: string) => void deleteStep(id), [deleteStep])
  const handleReorder = useCallback(
    (from: number, to: number) => void reorderStep(from, to),
    [reorderStep],
  )
  const handleUpdate = useCallback(
    (id: string, patch: StepPatch) => void updateStep(id, patch),
    [updateStep],
  )
  const handlePick = useCallback(
    (id: string, candidate: ScoredLocator) => void setStepLocator(id, candidate),
    [setStepLocator],
  )

  return (
    <StepList
      steps={steps}
      reorderable={!isActive}
      isFirstRun={!isActive && !hasActiveSession && !hasSessions}
      flashStepId={flashStepId}
      onDeleteStep={handleDelete}
      onReorderStep={handleReorder}
      onUpdateStep={handleUpdate}
      onPickLocator={handlePick}
      replayResults={replayState.results}
      replayRunningActionId={replayState.currentActionId}
      validationResults={validationResults}
      onAddAssertion={!isActive ? onAddAssertion : undefined}
      composedModes={composedModes}
      templateModes={templateModes}
      onSetComposedMode={!isActive ? onSetComposedMode : undefined}
      onSetTemplateMode={!isActive ? onSetTemplateMode : undefined}
    />
  )
})
