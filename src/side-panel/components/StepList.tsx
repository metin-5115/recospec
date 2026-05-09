import { useState, type ComponentType, type SVGProps } from 'react'
import {
  CheckCircle2,
  Globe,
  Keyboard,
  MousePointerClick,
  MoveVertical,
  Navigation,
  Pencil,
  Play,
  Video,
  X,
} from 'lucide-react'
import type { RecordedAction, ActionType, NetworkPayload } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'
import { LocatorDetail } from './LocatorDetail'

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
    default:
      return Play
  }
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
  onDeleteStep: (actionId: string) => void
}

export function StepList({ steps, onDeleteStep }: StepListProps) {
  const [openDetailId, setOpenDetailId] = useState<string | null>(null)

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

  return (
    <ol className="divide-y divide-border">
      {steps.map((step, index) => {
        const isNetwork = step.type === 'network'
        const primary = step.target?.primaryLocator
        const fallbacks = step.target?.fallbackLocators ?? []
        const allCandidates = primary ? [primary, ...fallbacks] : []
        const locatorLabel = isNetwork
          ? networkLabel(step)
          : primary
            ? selectorString(primary)
            : step.type
        const snapshotLine = isNetwork ? null : snapshotChip(step)
        const isOpen = openDetailId === step.actionId
        const Icon = actionIcon(step.type)

        return (
          <li
            key={step.actionId}
            className="group flex items-start gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-bg-elevated"
          >
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-bg-muted text-[10px] font-mono font-semibold text-text-subtle">
              {index + 1}
            </span>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span className="relative min-w-0 flex-1">
              <span className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => primary && setOpenDetailId(isOpen ? null : step.actionId)}
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
              {(snapshotLine || primary) && (
                <span className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
                  {primary && (
                    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      {primary.strategy}
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
                  onClose={() => setOpenDetailId(null)}
                />
              )}
            </span>
            <button
              onClick={() => onDeleteStep(step.actionId)}
              className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-subtle opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
              aria-label="Remove step"
              title="Remove step"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ol>
  )
}
