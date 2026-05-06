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
    default:
      return '▶'
  }
}

interface StepListProps {
  steps: RecordedAction[]
  onDeleteStep: (actionId: string) => void
}

export function StepList({ steps, onDeleteStep }: StepListProps) {
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
            <span className="min-w-0 flex-1">
              <span className="block truncate text-gray-700" title={locatorLabel}>
                {locatorLabel}
              </span>
              {strategy && (
                <span className="mt-0.5 inline-block rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                  {strategy}
                </span>
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
