import { useState, type ComponentType, type SVGProps } from 'react'
import {
  CheckCircle2,
  Globe,
  GripVertical,
  Hourglass,
  Keyboard,
  MousePointerClick,
  MoveVertical,
  Navigation,
  Pencil,
  Play,
  Video,
  X,
} from 'lucide-react'
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { RecordedAction, ActionType, NetworkPayload } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'
import { LocatorDetail } from './LocatorDetail'
import { StepEditModal } from './StepEditModal'
import type { StepPatch } from '@shared/types/messages'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

function actionIcon(type: ActionType): IconComponent {
  switch (type) {
    case 'click':
    case 'dblclick':
    case 'hover':
      return MousePointerClick
    case 'fill':
    case 'select':
    case 'check':
    case 'uncheck':
      return Pencil
    case 'navigate':
      return Navigation
    case 'keypress':
      return Keyboard
    case 'scroll':
      return MoveVertical
    case 'assert':
      return CheckCircle2
    case 'network':
      return Globe
    case 'wait':
      return Hourglass
    default:
      return Play
  }
}

interface WaitPayload {
  wait?: {
    reason?: string
    timeoutMs?: number
  }
}

function waitLabel(step: RecordedAction): string {
  const w = (step.payload as WaitPayload | undefined)?.wait
  const reason = w?.reason ?? 'auto'
  const timeoutMs = w?.timeoutMs
  const suffix = typeof timeoutMs === 'number' ? ` (${Math.round(timeoutMs / 1000)}s)` : ''
  return `Wait for ${reason}${suffix}`
}

function networkLabel(step: RecordedAction): string {
  const np = (step.payload ?? {}) as Partial<NetworkPayload>
  if (!np.url) return 'network'
  const status = np.status ? ` ${np.status}` : ''
  let path = np.url
  try {
    path = new URL(np.url).pathname
  } catch {
    /* keep raw url */
  }
  return `${(np.method ?? 'GET').toUpperCase()} ${path}${status}`
}

function selectorString(loc: ScoredLocator): string {
  return typeof loc.selector === 'string' ? loc.selector : JSON.stringify(loc.selector)
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-success-soft text-success'
  if (score >= 50) return 'bg-warning-soft text-warning'
  return 'bg-danger-soft text-danger'
}

function snapshotChip(step: RecordedAction): string | null {
  const snap = step.target?.elementSnapshot ?? step.elementSnapshot
  if (!snap) return null
  const parts: string[] = [snap.tagName.toLowerCase()]
  const text = snap.textContent?.trim()
  if (text) parts.push(`"${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`)
  const id = snap.attributes.id
  if (id) parts.push(`#${id}`)
  return parts.join(' · ')
}

interface StepListProps {
  steps: RecordedAction[]
  reorderable: boolean
  onDeleteStep: (actionId: string) => void
  onReorderStep?: (fromIndex: number, toIndex: number) => void
  onUpdateStep?: (actionId: string, patch: StepPatch) => void
  onPickLocator?: (actionId: string, candidate: ScoredLocator) => void
}

export function StepList({
  steps,
  reorderable,
  onDeleteStep,
  onReorderStep,
  onUpdateStep,
  onPickLocator,
}: StepListProps) {
  const [openDetailId, setOpenDetailId] = useState<string | null>(null)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)

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
      {steps.map((step, index) => (
        <SortableStep
          key={step.actionId}
          step={step}
          index={index}
          reorderable={reorderable}
          isOpen={openDetailId === step.actionId}
          onToggleDetail={() =>
            setOpenDetailId((prev) => (prev === step.actionId ? null : step.actionId))
          }
          onCloseDetail={() => setOpenDetailId(null)}
          onDelete={() => onDeleteStep(step.actionId)}
          onEdit={() => setEditingStepId(step.actionId)}
        />
      ))}
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

interface SortableStepProps {
  step: RecordedAction
  index: number
  reorderable: boolean
  isOpen: boolean
  onToggleDetail: () => void
  onCloseDetail: () => void
  onDelete: () => void
  onEdit: () => void
}

function SortableStep({
  step,
  index,
  reorderable,
  isOpen,
  onToggleDetail,
  onCloseDetail,
  onDelete,
  onEdit,
}: SortableStepProps) {
  const sortable = useSortable({ id: step.actionId, disabled: !reorderable })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable

  const style = reorderable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }
    : undefined

  const isNetwork = step.type === 'network'
  const isWait = step.type === 'wait'
  const primary = step.target?.primaryLocator
  const fallbacks = step.target?.fallbackLocators ?? []
  const allCandidates = step.target?.allCandidates ?? (primary ? [primary, ...fallbacks] : [])
  const locatorLabel = isNetwork
    ? networkLabel(step)
    : isWait
      ? waitLabel(step)
      : primary
        ? selectorString(primary)
        : step.type
  const snapshotLine = isNetwork || isWait ? null : snapshotChip(step)
  const Icon = actionIcon(step.type)
  const isOverridden = step.target?.userOverridden === true
  const editable = reorderable

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group flex items-start gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-bg-elevated"
    >
      {reorderable && (
        <button
          type="button"
          aria-label="Drag to reorder"
          className="mt-0.5 inline-flex h-5 w-4 cursor-grab touch-none items-center justify-center text-text-subtle hover:text-text-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-bg-muted text-[10px] font-mono font-semibold text-text-subtle">
        {index + 1}
      </span>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
      <span className="relative min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => primary && onToggleDetail()}
            disabled={!primary}
            className="min-w-0 flex-1 break-all text-left font-mono text-[13px] text-text hover:text-accent disabled:cursor-default disabled:hover:text-text"
            title={locatorLabel}
            aria-label={primary ? 'Show locator detail' : undefined}
          >
            {locatorLabel}
          </button>
          {primary && (
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${scoreColor(primary.score)}`}
              title={`Score ${primary.score}/100 · ${primary.matchCount} match${primary.matchCount === 1 ? '' : 'es'}`}
            >
              {primary.score}
            </span>
          )}
        </span>
        {(snapshotLine || primary || isOverridden) && (
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
            {primary && (
              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                {primary.strategy}
              </span>
            )}
            {isOverridden && (
              <span
                className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent"
                title="Locator manually overridden by user"
              >
                ✏ overridden
              </span>
            )}
            {snapshotLine && <span className="truncate font-mono">{snapshotLine}</span>}
          </span>
        )}
        {isOpen && primary && (
          <LocatorDetail
            primary={primary}
            candidates={allCandidates}
            snapshot={step.target?.elementSnapshot}
            onClose={onCloseDetail}
          />
        )}
      </span>
      {editable && (
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-subtle opacity-0 transition-all hover:bg-accent-soft hover:text-accent group-hover:opacity-100"
          aria-label="Edit step"
          title="Edit step"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className={`${editable ? '' : 'ml-auto'} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-subtle opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100`}
        aria-label="Remove step"
        title="Remove step"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  )
}
