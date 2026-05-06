import { useState } from 'react'
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="w-72 rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Add Assertion
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-600" title={previewLabel}>
            {previewLabel}
          </p>
        </div>

        <div className="space-y-1 px-4 py-3">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                i === selectedIndex
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
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
              className="mt-2 w-full rounded border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Assertion
          </button>
        </div>
      </div>
    </div>
  )
}
