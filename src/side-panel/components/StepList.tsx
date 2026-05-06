import { useState } from 'react'
import type { RecordedAction, ActionType } from '@shared/types/action'

function actionIcon(type: ActionType): string {
  switch (type) {
    case 'click':
    case 'dblclick':
    case 'hover':
      return '👆'
    case 'fill':
    case 'select':
    case 'check':
    case 'uncheck':
      return '✏️'
    case 'navigate':
      return '🧭'
    case 'keypress':
      return '⌨️'
    case 'scroll':
      return '↕'
    case 'assert':
      return '✓'
    default:
      return '▶'
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
      className="absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded border border-gray-200 bg-white py-1 shadow-lg"
      onMouseLeave={onClose}
    >
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        Fallback locators
      </p>
      {fallbacks.map((f, i) => (
        <div key={i} className="px-3 py-1">
          <span className="mr-1 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-500">
            {f.strategy}
          </span>
          <span className="text-[10px] text-gray-600 font-mono truncate">{f.selector}</span>
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
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-3 text-4xl">🎬</div>
        <p className="mb-1 text-sm font-medium text-gray-600">Start recording to capture steps</p>
        <p className="text-xs text-gray-400">Open a page and click "Start Recording"</p>
      </div>
    )
  }

  return (
    <ol className="divide-y divide-gray-100">
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

        return (
          <li
            key={step.actionId}
            className="group flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <span className="w-5 shrink-0 text-right text-xs font-mono text-gray-400">
              {index + 1}
            </span>
            <span className="shrink-0 text-base leading-none" title={step.type}>
              {actionIcon(step.type)}
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate text-gray-700" title={locatorLabel}>
                {locatorLabel}
              </span>
              {strategy && (
                <button
                  className={`mt-0.5 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100 ${
                    hasFallbacks
                      ? 'cursor-pointer bg-blue-50 text-blue-600 hover:bg-blue-100'
                      : 'cursor-default bg-blue-50 text-blue-600'
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
                    <span className="rounded-full bg-blue-200 px-1 text-blue-700">
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
              className="ml-auto shrink-0 px-1 text-gray-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
              title="Remove step"
            >
              ×
            </button>
          </li>
        )
      })}
    </ol>
  )
}
