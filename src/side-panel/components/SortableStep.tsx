import { memo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  GripVertical,
  Loader2,
  Pencil,
  PlusCircle,
  X,
  XCircle,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { RecordedAction } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'
import type { TemplateParamMode } from '@codegen/ir/types'
import type { ComposedParamMode } from '@codegen/planner/template-modes'
import { classifyStep } from '@shared/locator-quality'
import type { LocatorValidationResult } from '@shared/types/messages'
import { STRATEGY_DISPLAY_NAME } from '@shared/constants'
import { LocatorDetail } from './LocatorDetail'
import { DynamicModeControl } from './DynamicModeControl'
import {
  actionIcon,
  networkLabelParts,
  networkLabelText,
  qualityChip,
  selectorString,
  snapshotChip,
  waitLabel,
} from './step-presentation'
import {
  STRATEGY_BADGE_CLASS,
  STRATEGY_HELP_TEXT,
  networkStatusClass,
  scoreTier,
} from './locator-presentation'

export type ReplayStepStatus = 'running' | 'pass' | 'fail' | 'skipped'

export interface SortableStepProps {
  step: RecordedAction
  index: number
  reorderable: boolean
  isOpen: boolean
  flash: boolean
  replayStatus?: ReplayStepStatus
  validation?: LocatorValidationResult
  composedMode: ComposedParamMode
  templateMode: TemplateParamMode
  /** Callbacks take the step (or its id) so one stable function serves every row. */
  onSetComposedMode?: (modeKey: string, mode: ComposedParamMode) => void
  onSetTemplateMode?: (modeKey: string, mode: TemplateParamMode) => void
  onAddAssertion?: (actionId: string) => void
  onToggleDetail: (actionId: string) => void
  onCloseDetail: () => void
  onDelete: (actionId: string) => void
  onEdit: (actionId: string) => void
  onPickLocator?: (actionId: string, candidate: ScoredLocator) => void
}

function SortableStepRow({
  step,
  index,
  reorderable,
  isOpen,
  flash,
  replayStatus,
  validation,
  composedMode,
  templateMode,
  onSetComposedMode,
  onSetTemplateMode,
  onAddAssertion,
  onToggleDetail,
  onCloseDetail,
  onDelete,
  onEdit,
  onPickLocator,
}: SortableStepProps) {
  const primary0 = step.target?.primaryLocator
  const sortable = useSortable({ id: step.actionId, disabled: !reorderable })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable

  const style = reorderable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }
    : undefined

  const modeKey = primary0 ? selectorString(primary0) : ''
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
  // Prefer the signal persisted at capture time; re-derive for older steps and
  // whenever the user has manually overridden the locator (a fix should clear a
  // stale warning).
  const quality = isOverridden
    ? classifyStep(step)
    : (step.target?.quality ?? step.quality ?? classifyStep(step))
  const qualityBadge = qualityChip(quality.level)
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
            onClick={() => primary && onToggleDetail(step.actionId)}
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
        {(snapshotLine || primary || isOverridden || fallbacks.length > 0 || qualityBadge) && (
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
            {qualityBadge && (
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${qualityBadge.className}`}
                title={quality.hint ?? undefined}
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {qualityBadge.label}
              </span>
            )}
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
        {primary && onSetComposedMode && onSetTemplateMode && (
          <DynamicModeControl
            primary={primary}
            composedMode={composedMode}
            templateMode={templateMode}
            onSetComposedMode={(mode) => onSetComposedMode(modeKey, mode)}
            onSetTemplateMode={(mode) => onSetTemplateMode(modeKey, mode)}
          />
        )}
        {isOpen && primary && (
          <LocatorDetail
            primary={primary}
            candidates={allCandidates}
            snapshot={step.target?.elementSnapshot}
            diagnostics={step.target?.diagnostics}
            onClose={onCloseDetail}
            onPickLocator={
              reorderable && onPickLocator
                ? (candidate) => onPickLocator(step.actionId, candidate)
                : undefined
            }
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
          onClick={() => onAddAssertion(step.actionId)}
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
          onClick={() => onEdit(step.actionId)}
          className={`${replayStatus || validation || onAddAssertion ? '' : 'ml-auto'} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-subtle opacity-0 transition-all hover:bg-accent-soft hover:text-accent group-hover:opacity-100`}
          aria-label="Edit step"
          title="Edit step"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(step.actionId)}
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

/** One recorded step. Memoized: props are primitives or stable callbacks, so appending a step leaves existing rows alone. */
export const SortableStep = memo(SortableStepRow)
