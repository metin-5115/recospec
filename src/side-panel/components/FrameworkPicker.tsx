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

/** Frameworks that currently emit BDD output. */
const BDD_SUPPORTED: ReadonlySet<FrameworkId> = new Set<FrameworkId>(['playwright-ts'])

interface FrameworkPickerProps {
  value: FrameworkId
  onChange: (framework: FrameworkId) => void
  bddEnabled: boolean
  onBddChange: (enabled: boolean) => void
}

export function FrameworkPicker({
  value,
  onChange,
  bddEnabled,
  onBddChange,
}: FrameworkPickerProps) {
  const bddAvailable = BDD_SUPPORTED.has(value)
  return (
    <div className="space-y-2">
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
      <button
        type="button"
        onClick={() => onBddChange(!bddEnabled)}
        disabled={!bddAvailable}
        aria-pressed={bddEnabled}
        aria-label="Toggle Gherkin BDD output"
        title={
          bddAvailable
            ? bddEnabled
              ? 'BDD: Gherkin .feature + step definitions enabled'
              : 'Enable Gherkin .feature + step definitions output'
            : 'BDD output is not yet supported for this framework'
        }
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
          bddEnabled && bddAvailable
            ? 'bg-accent-soft text-accent shadow-inner ring-1 ring-accent/40'
            : 'bg-bg-muted text-text-muted hover:text-text'
        } ${!bddAvailable ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <span className="inline-block h-2 w-2 rounded-full bg-current" aria-hidden="true" />
        BDD (Gherkin)
        {bddEnabled && bddAvailable && <span className="text-[10px] font-normal">ON</span>}
      </button>
    </div>
  )
}
