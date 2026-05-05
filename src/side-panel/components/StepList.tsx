import type { RecordedAction } from '@shared/types/action'

interface StepListProps {
  steps: RecordedAction[]
}

export function StepList({ steps }: StepListProps) {
  if (steps.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-gray-400">
        No steps recorded yet. Start recording and interact with the page.
      </p>
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

        return (
          <li key={step.actionId} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="w-5 shrink-0 text-right text-xs font-mono text-gray-400">
              {index + 1}
            </span>
            <span className="w-16 shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-center text-xs font-semibold uppercase text-blue-700">
              {step.type}
            </span>
            <span className="truncate text-gray-700" title={locatorLabel}>
              {locatorLabel}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
