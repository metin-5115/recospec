import { useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import type { AssertionSuggestion } from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import type { ElementSnapshot } from '@shared/types/action'

const NEEDS_VALUE: AssertionSuggestion['type'][] = ['text', 'value', 'attribute', 'count']

interface AssertionBuilderProps {
  suggestions: AssertionSuggestion[]
  locatorBundle: LocatorBundle | null
  elementSnapshot: ElementSnapshot
  pageMetadata: { url: string; title: string }
  onConfirm: (
    suggestion: AssertionSuggestion,
    locatorBundle: LocatorBundle | null,
    elementSnapshot: ElementSnapshot,
    pageMetadata: { url: string; title: string },
    customExpected?: string,
  ) => void
  onCancel: () => void
}

export function AssertionBuilder({
  suggestions,
  locatorBundle,
  elementSnapshot,
  pageMetadata,
  onConfirm,
  onCancel,
}: AssertionBuilderProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [customValue, setCustomValue] = useState('')

  const selected = suggestions[selectedIndex]
  const needsValue = NEEDS_VALUE.includes(selected.type)
  const previewLabel =
    elementSnapshot.tagName +
    (elementSnapshot.textContent ? ` "${elementSnapshot.textContent.slice(0, 40)}"` : '')

  function handleConfirm() {
    const customExpected = customValue !== '' ? customValue : undefined
    onConfirm(selected, locatorBundle, elementSnapshot, pageMetadata, customExpected)
  }

  function handleSelect(index: number) {
    setSelectedIndex(index)
    setCustomValue('')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Assertion"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="w-80 overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-accent shadow-accent-glow">
              <CheckCircle2 className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Add Assertion</p>
              <p className="mt-0.5 truncate text-xs text-text-muted" title={previewLabel}>
                {previewLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-bg-muted hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-1 px-3 py-3">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                i === selectedIndex
                  ? 'border-accent bg-accent-soft font-medium text-accent shadow-sm'
                  : 'border-transparent text-text hover:border-border hover:bg-bg-elevated'
              }`}
            >
              {s.label}
            </button>
          ))}

          {needsValue && (
            <input
              type="text"
              placeholder="Custom value (optional)"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          )}
        </div>

        <div className="flex gap-2 border-t border-border bg-bg-elevated/40 px-4 py-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-gradient-accent px-3 py-2 text-sm font-semibold text-white shadow-accent-glow transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            Add Assertion
          </button>
        </div>
      </div>
    </div>
  )
}
