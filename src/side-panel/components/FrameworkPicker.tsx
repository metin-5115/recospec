import type { FrameworkId } from '@shared/types/generated'

interface FrameworkOption {
  id: FrameworkId
  label: string
}

const OPTIONS: FrameworkOption[] = [
  { id: 'playwright-ts', label: 'Playwright TS' },
  { id: 'cypress', label: 'Cypress' },
]

interface FrameworkPickerProps {
  value: FrameworkId
  onChange: (framework: FrameworkId) => void
}

export function FrameworkPicker({ value, onChange }: FrameworkPickerProps) {
  return (
    <div
      role="tablist"
      aria-label="Output framework"
      className="flex overflow-hidden rounded border border-gray-300"
    >
      {OPTIONS.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
