import { useMemo, useState, type ComponentType, type SVGProps } from 'react'
import {
  CheckCircle2,
  CircleDashed,
  Globe,
  GripVertical,
  Hourglass,
  Keyboard,
  Loader2,
  MousePointerClick,
  MoveVertical,
  Navigation,
  Pencil,
  Play,
  PlusCircle,
  Video,
  X,
  XCircle,
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
import { EmptyStateGuide } from './EmptyStateGuide'
import type { LocatorValidationResult, StepPatch } from '@shared/types/messages'
import { STRATEGY_DISPLAY_NAME } from '@shared/constants'
import {
  STRATEGY_BADGE_CLASS,
  STRATEGY_HELP_TEXT,
  networkStatusClass,
  scoreTier,
} from './locator-presentation'

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

interface NetworkLabelParts {
  method: string
  path: string
  status?: number
}

function networkLabelParts(step: RecordedAction): NetworkLabelParts | null {
  const np = (step.payload ?? {}) as Partial<NetworkPayload>
  if (!np.url) return null
  let path = np.url
  try {
    path = new URL(np.url).pathname
  } catch {
    /* keep raw url */
  }
  return {
    method: (np.method ?? 'GET').toUpperCase(),
    path,
    status: typeof np.status === 'number' ? np.status : undefined,
  }
}

function networkLabelText(parts: NetworkLabelParts | null): string {
  if (!parts) return 'network'
  const status = parts.status ? ` ${parts.status}` : ''
  return `${parts.method} ${parts.path}${status}`
}

function selectorString(loc: ScoredLocator): string {
  return typeof loc.selector === 'string' ? loc.selector : JSON.stringify(loc.selector)
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

export type ReplayStepStatus = 'running' | 'pass' | 'fail' | 'skipped'

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
}: StepListProps) {
  const [openDetailId, setOpenDetailId] = useState<string | null>(null)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const validationByAction = useMemo(() => {
    const map = new Map<string, LocatorValidationResult>()
    for (const r of validationResults ?? []) map.set(r.actionId, r)
    return map
  }, [validationResults])

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
        const validation = validationByAction.get(step.actionId)
        return (
          <SortableStep
            key={step.actionId}
            step={step}
            index={index}
            reorderable={reorderable}
            isOpen={openDetailId === step.actionId}
            flash={flashStepId === step.actionId}
            replayStatus={replayStatus}
            validation={validation}
            onAddAssertion={
              onAddAssertion && step.target ? () => onAddAssertion(step.actionId) : undefined
            }
            onToggleDetail={() =>
              setOpenDetailId((prev) => (prev === step.actionId ? null : step.actionId))
            }
            onCloseDetail={() => setOpenDetailId(null)}
            onDelete={() => onDeleteStep(step.actionId)}
            onEdit={() => setEditingStepId(step.actionId)}
            onPickLocator={
              onPickLocator
                ? (candidate) => {
                    onPickLocator(step.actionId, candidate)
                    setOpenDetailId(null)
                  }
                : undefined
            }
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

interface SortableStepProps {
  step: RecordedAction
  index: number
  reorderable: boolean
  isOpen: boolean
  flash: boolean
  replayStatus?: ReplayStepStatus
  validation?: LocatorValidationResult
  onAddAssertion?: () => void
  onToggleDetail: () => void
  onCloseDetail: () => void
  onDelete: () => void
  onEdit: () => void
  onPickLocator?: (candidate: ScoredLocator) => void
}

function SortableStep({
  step,
  index,
  reorderable,
  isOpen,
  flash,
  replayStatus,
  validation,
  onAddAssertion,
  onToggleDetail,
  onCloseDetail,
  onDelete,
  onEdit,
  onPickLocator,
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
  const networkParts = isNetwork ? networkLabelParts(step) : null
  const locatorLabel = isNetwork
    ? networkLabelText(networkParts)
    : isWait
      ? waitLabel(step)
      : primary
        ? selectorString(primary)
        : step.type
  const snapshotLine = isNetwork || isWait ? null : snapshotChip(step)
  const Icon = actionIcon(step.type)
  const isOverridden = step.target?.userOverridden === true
  const editable = reorderable
  const tier = primary ? scoreTier(primary.score) : null
  const validationOk = validation?.primary.status === 'matched'
  const validationFail = validation && validation.primary.status !== 'matched'
  const validationLabel = validation
    ? `Locator ${validation.primary.status}${validation.primary.matchCount > 1 ? ` (${validation.primary.matchCount} matches)` : ''}${validation.urlMismatch ? ' · URL changed' : ''}`
    : null

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-bg-elevated${flash ? ' animate-step-flash' : ''}`}
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
            {isNetwork && networkParts ? (
              <>
                <span className="font-semibold">{networkParts.method}</span> {networkParts.path}
                {typeof networkParts.status === 'number' && (
                  <span className={`ml-1 font-semibold ${networkStatusClass(networkParts.status)}`}>
                    {networkParts.status}
                  </span>
                )}
              </>
            ) : (
              locatorLabel
            )}
          </button>
          {primary && tier && (
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${STRATEGY_BADGE_CLASS[primary.strategy]}`}
              title={`Score ${primary.score}/100 · ${tier.label} · ${primary.matchCount} match${primary.matchCount === 1 ? '' : 'es'} · ${STRATEGY_HELP_TEXT[primary.strategy]}`}
              aria-label={`Stability ${tier.label}, score ${primary.score} out of 100`}
            >
              {primary.score}
              <span className="ml-1 hidden font-sans font-medium opacity-80 sm:inline">
                · {tier.label}
              </span>
            </span>
          )}
        </span>
        {(snapshotLine || primary || isOverridden || fallbacks.length > 0) && (
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
            {primary && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STRATEGY_BADGE_CLASS[primary.strategy]}`}
                title={STRATEGY_HELP_TEXT[primary.strategy]}
              >
                {STRATEGY_DISPLAY_NAME[primary.strategy]}
              </span>
            )}
            {fallbacks.length > 0 && (
              <span
                className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
                title="If the primary locator fails during replay, these alternatives are tried in order"
              >
                {fallbacks.length} fallback{fallbacks.length === 1 ? '' : 's'}
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
            onPickLocator={reorderable ? onPickLocator : undefined}
          />
        )}
      </span>
      {validation && !replayStatus && (
        <span
          className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center"
          aria-label={validationLabel ?? 'Locator validation result'}
          title={validationLabel ?? undefined}
        >
          {validationOk ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          ) : validationFail ? (
            <XCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
          ) : (
            <CircleDashed className="h-3.5 w-3.5 text-text-subtle" aria-hidden="true" />
          )}
        </span>
      )}
      {replayStatus && (
        <span
          className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center"
          aria-label={`Replay ${replayStatus}`}
          title={replayStatusTitle(replayStatus)}
        >
          <ReplayStatusIcon status={replayStatus} />
        </span>
      )}
      {onAddAssertion && (
        <button
          type="button"
          onClick={onAddAssertion}
          className={`${replayStatus || validation ? '' : 'ml-auto'} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-subtle opacity-0 transition-all hover:bg-success-soft hover:text-success group-hover:opacity-100`}
          aria-label="Add assertion after this step"
          title="Add assertion after this step"
        >
          <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {editable && (
        <button
          type="button"
          onClick={onEdit}
          className={`${replayStatus || validation || onAddAssertion ? '' : 'ml-auto'} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-subtle opacity-0 transition-all hover:bg-accent-soft hover:text-accent group-hover:opacity-100`}
          aria-label="Edit step"
          title="Edit step"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className={`${replayStatus || validation || onAddAssertion || editable ? '' : 'ml-auto'} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-subtle opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100`}
        aria-label="Remove step"
        title="Remove step"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  )
}

function ReplayStatusIcon({ status }: { status: ReplayStepStatus }) {
  if (status === 'running')
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" aria-hidden="true" />
  if (status === 'pass')
    return <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
  if (status === 'fail') return <XCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
  return <CircleDashed className="h-3.5 w-3.5 text-text-subtle" aria-hidden="true" />
}

function replayStatusTitle(status: ReplayStepStatus): string {
  switch (status) {
    case 'running':
      return 'Running…'
    case 'pass':
      return 'Replay passed'
    case 'fail':
      return 'Replay failed'
    case 'skipped':
      return 'Skipped — no DOM analog'
  }
}
