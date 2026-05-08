import { useState, type ComponentType, type SVGProps } from 'react'
import {
  CheckCircle2,
  Keyboard,
  MousePointerClick,
  MoveVertical,
  Navigation,
  Pencil,
  Play,
  Video,
  X,
} from 'lucide-react'
import type { RecordedAction, ActionType } from '@shared/types/action'

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
    default:
      return Play
  }
}

interface FallbackDropdownProps {
  fallbacks: { strategy: string; selector: string }[]
  onClose: () => void
}

function FallbackDropdown({ fallbacks, onClose }: FallbackDropdownProps) {
  if (fallbacks.length === 0) return null
  return (
    <div
      className="absolute left-0 top-full z-10 mt-1 min-w-[220px] rounded-xl border border-border bg-bg py-1.5 shadow-lg"
      onMouseLeave={onClose}
    >
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
        Fallback locators
      </p>
      {fallbacks.map((f, i) => (
        <div key={i} className="px-3 py-1">
          <span className="mr-1.5 rounded-md bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            {f.strategy}
          </span>
          <span className="font-mono text-[10px] text-text-muted">{f.selector}</span>
        </div>
      ))}
    </div>
  )
}

interface StepListProps {
  steps: RecordedAction[]
  onDeleteStep: (actionId: string) => void
}

export function StepList({ steps, onDeleteStep }: StepListProps) {
  const [openFallbackId, setOpenFallbackId] = useState<string | null>(null)

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
        const snapshot = step.target?.elementSnapshot ?? step.elementSnapshot
        const locatorLabel =
          typeof step.target?.primaryLocator.selector === 'string'
            ? step.target.primaryLocator.selector
            : snapshot
              ? `<${snapshot.tagName}>`
              : step.type
        const strategy = step.target?.primaryLocator.strategy
        const fallbacks = (step.target?.fallbackLocators ?? []).map((l) => ({
          strategy: l.strategy,
          selector: typeof l.selector === 'string' ? l.selector : JSON.stringify(l.selector),
        }))
        const hasFallbacks = fallbacks.length > 0
        const isOpen = openFallbackId === step.actionId
        const Icon = actionIcon(step.type)

        return (
          <li
            key={step.actionId}
            className="group flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-bg-elevated"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-bg-muted text-[10px] font-mono font-semibold text-text-subtle">
              {index + 1}
            </span>
            <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span className="relative min-w-0 flex-1">
              <span className="block truncate font-mono text-[13px] text-text" title={locatorLabel}>
                {locatorLabel}
              </span>
              {strategy && (
                <button
                  className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100 ${
                    hasFallbacks
                      ? 'cursor-pointer bg-accent-soft text-accent hover:bg-accent hover:text-white'
                      : 'cursor-default bg-accent-soft text-accent'
                  }`}
                  onClick={() =>
                    hasFallbacks ? setOpenFallbackId(isOpen ? null : step.actionId) : undefined
                  }
                  title={
                    hasFallbacks ? `${fallbacks.length} fallback locator(s) available` : strategy
                  }
                >
                  {strategy}
                  {hasFallbacks && (
                    <span className="rounded-full bg-white/30 px-1 text-[9px]">
                      +{fallbacks.length}
                    </span>
                  )}
                </button>
              )}
              {isOpen && (
                <FallbackDropdown fallbacks={fallbacks} onClose={() => setOpenFallbackId(null)} />
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
