import { useCallback, useMemo, useState } from 'react'
import { Video } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { RecordedAction } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'
import type { TemplateParamMode } from '@codegen/ir/types'
import type { ComposedParamMode } from '@codegen/planner/template-modes'
import { StepEditModal } from './StepEditModal'
import { EmptyStateGuide } from './EmptyStateGuide'
import type { LocatorValidationResult, StepPatch } from '@shared/types/messages'
import { SortableStep, type ReplayStepStatus } from './SortableStep'
import { selectorString } from './step-presentation'

export type { ReplayStepStatus } from './SortableStep'

interface StepListProps {
  steps: RecordedAction[]
  reorderable: boolean
  isFirstRun?: boolean
  /** When set, the matching step item plays an 800ms flash animation. */
  flashStepId?: string | null
  onDeleteStep: (actionId: string) => void
  onReorderStep?: (fromIndex: number, toIndex: number) => void
  onUpdateStep?: (actionId: string, patch: StepPatch) => void
  onPickLocator?: (actionId: string, candidate: ScoredLocator) => void
  /**
   * Per-step replay outcomes keyed by actionId. Drives the inline ✓ / ✗
   * indicator on each row. Omitted = step has not been replayed yet.
   */
  replayResults?: Record<string, ReplayStepStatus>
  /** Currently-running step during replay — receives the spinner icon. */
  replayRunningActionId?: string | null
  /**
   * Per-step locator validation outcomes (from "Test on Page"). Rendered as
   * a small inline ✓ / ✗ next to the row so users don't have to scroll the
   * separate `LocatorValidationPanel` to find which step failed.
   */
  validationResults?: LocatorValidationResult[]
  /**
   * Opens the AssertionBuilder seeded from this step. Only present after a
   * stopped session is loaded (recording sessions don't get this button).
   */
  onAddAssertion?: (actionId: string) => void
  /** Per-element dynamic-locator render modes, keyed by the locator string. */
  composedModes?: Record<string, ComposedParamMode>
  templateModes?: Record<string, TemplateParamMode>
  onSetComposedMode?: (key: string, mode: ComposedParamMode) => void
  onSetTemplateMode?: (key: string, mode: TemplateParamMode) => void
}

export function StepList({
  steps,
  reorderable,
  isFirstRun = false,
  flashStepId = null,
  onDeleteStep,
  onReorderStep,
  onUpdateStep,
  onPickLocator,
  replayResults,
  replayRunningActionId,
  validationResults,
  onAddAssertion,
  composedModes,
  templateModes,
  onSetComposedMode,
  onSetTemplateMode,
}: StepListProps) {
  const [openDetailId, setOpenDetailId] = useState<string | null>(null)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const validationByAction = useMemo(() => {
    const map = new Map<string, LocatorValidationResult>()
    for (const r of validationResults ?? []) map.set(r.actionId, r)
    return map
  }, [validationResults])

  const toggleDetail = useCallback(
    (actionId: string) => setOpenDetailId((prev) => (prev === actionId ? null : actionId)),
    [],
  )
  const closeDetail = useCallback(() => setOpenDetailId(null), [])
  const pickLocator = useCallback(
    (actionId: string, candidate: ScoredLocator) => {
      onPickLocator?.(actionId, candidate)
      setOpenDetailId(null)
    },
    [onPickLocator],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = steps.findIndex((s) => s.actionId === active.id)
    const toIndex = steps.findIndex((s) => s.actionId === over.id)
    if (fromIndex === -1 || toIndex === -1) return
    onReorderStep?.(fromIndex, toIndex)
  }

  if (steps.length === 0) {
    if (isFirstRun) {
      return <EmptyStateGuide />
    }
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
          <Video className="h-7 w-7 text-accent" aria-hidden="true" />
        </div>
        <p className="mb-1 text-base font-semibold text-text">No steps yet</p>
        <p className="text-sm text-text-muted">
          Open a page and click <span className="font-medium text-text">Record</span> to capture
          interactions.
        </p>
      </div>
    )
  }

  const editingStep = editingStepId
    ? (steps.find((s) => s.actionId === editingStepId) ?? null)
    : null

  const list = (
    <ol className="divide-y divide-border">
      {steps.map((step, index) => {
        const isRunning = replayRunningActionId === step.actionId
        const replayStatus: ReplayStepStatus | undefined = isRunning
          ? 'running'
          : replayResults?.[step.actionId]
        const modeKey = step.target?.primaryLocator
          ? selectorString(step.target.primaryLocator)
          : ''
        return (
          <SortableStep
            key={step.actionId}
            step={step}
            index={index}
            reorderable={reorderable}
            isOpen={openDetailId === step.actionId}
            flash={flashStepId === step.actionId}
            replayStatus={replayStatus}
            validation={validationByAction.get(step.actionId)}
            composedMode={composedModes?.[modeKey] ?? 'scoped'}
            templateMode={templateModes?.[modeKey] ?? 'param'}
            onSetComposedMode={onSetComposedMode}
            onSetTemplateMode={onSetTemplateMode}
            onAddAssertion={onAddAssertion && step.target ? onAddAssertion : undefined}
            onToggleDetail={toggleDetail}
            onCloseDetail={closeDetail}
            onDelete={onDeleteStep}
            onEdit={setEditingStepId}
            onPickLocator={onPickLocator ? pickLocator : undefined}
          />
        )
      })}
    </ol>
  )

  return (
    <>
      {reorderable ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={steps.map((s) => s.actionId)}
            strategy={verticalListSortingStrategy}
          >
            {list}
          </SortableContext>
        </DndContext>
      ) : (
        list
      )}
      {editingStep && (
        <StepEditModal
          step={editingStep}
          onCancel={() => setEditingStepId(null)}
          onApply={(patch) => {
            onUpdateStep?.(editingStep.actionId, patch)
            setEditingStepId(null)
          }}
          onPickLocator={(candidate) => {
            onPickLocator?.(editingStep.actionId, candidate)
            setEditingStepId(null)
          }}
        />
      )}
    </>
  )
}
