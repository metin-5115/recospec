import type { FrameworkId } from '@shared/types/generated'

interface FrameworkOption {
  id: FrameworkId
  label: string
}

const OPTIONS: FrameworkOption[] = [
  { id: 'playwright-ts', label: 'Playwright TS' },
  { id: 'cypress', label: 'Cypress' },
  { id: 'selenium-py', label: 'Selenium Python' },
  { id: 'selenium-java', label: 'Selenium Java' },
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
      className="flex gap-1 rounded-lg bg-bg-muted p-1"
    >
      {OPTIONS.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              active ? 'bg-bg text-text shadow-sm' : 'text-text-muted hover:text-text'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
