import { useRef, useState } from 'react'
import { CheckCircle2, X, Camera } from 'lucide-react'
import type { AssertionSuggestion } from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import type { ElementSnapshot } from '@shared/types/action'
import { useFocusTrap } from '@shared/hooks/useFocusTrap'

const NEEDS_VALUE: AssertionSuggestion['type'][] = [
  'text',
  'text-contains',
  'matches',
  'value',
  'attribute',
  'count',
]

interface AssertionBuilderProps {
  suggestions: AssertionSuggestion[]
  locatorBundle: LocatorBundle | null
  elementSnapshot: ElementSnapshot
  pageMetadata: { url: string; title: string }
  screenshotDataUrl?: string
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
  screenshotDataUrl,
  onConfirm,
  onCancel,
}: AssertionBuilderProps) {
  const valueFor = (s: AssertionSuggestion): string =>
    NEEDS_VALUE.includes(s.type) && s.expected !== undefined ? String(s.expected) : ''

  const [selectedIndex, setSelectedIndex] = useState(0)
  // Pre-fill so the suggested value/pattern is visible and editable (e.g. the
  // `matches` regex source). Blank-but-needed still falls back to the default.
  const [customValue, setCustomValue] = useState(() => valueFor(suggestions[0]))
  const [screenshotName, setScreenshotName] = useState('')

  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, { onEscape: onCancel })

  const selected = suggestions[selectedIndex]
  const isScreenshot = selected.type === 'screenshot'
  const needsValue = NEEDS_VALUE.includes(selected.type)
  const previewLabel =
    elementSnapshot.tagName +
    (elementSnapshot.textContent ? ` "${elementSnapshot.textContent.slice(0, 40)}"` : '')

  function handleConfirm() {
    if (isScreenshot) {
      const name = screenshotName.trim() || selected.name
      onConfirm(selected, locatorBundle, elementSnapshot, pageMetadata, name)
      return
    }
    const customExpected = customValue !== '' ? customValue : undefined
    onConfirm(selected, locatorBundle, elementSnapshot, pageMetadata, customExpected)
  }

  function handleSelect(index: number) {
    setSelectedIndex(index)
    const next = suggestions[index]
    setCustomValue(valueFor(next))
    if (next.type === 'screenshot') {
      setScreenshotName(next.name ?? '')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Assertion"
      className="animate-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        className="animate-modal-in w-80 overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl outline-none"
      >
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
              placeholder={
                selected.type === 'matches' ? 'Regex pattern' : 'Custom value (optional)'
              }
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          )}

          {isScreenshot && (
            <div className="mt-2 space-y-2 rounded-lg border border-border bg-bg-elevated/40 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Visual snapshot
              </div>
              {screenshotDataUrl ? (
                <img
                  src={screenshotDataUrl}
                  alt="Page snapshot preview"
                  className="block max-h-28 w-full rounded-md border border-border bg-bg object-contain"
                />
              ) : (
                <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-bg text-[11px] text-text-subtle">
                  Preview unavailable
                </div>
              )}
              <input
                type="text"
                placeholder="Snapshot name"
                value={screenshotName}
                onChange={(e) => setScreenshotName(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <p className="text-[11px] text-text-subtle">
                Threshold: {(selected.threshold ?? 0.2).toFixed(2)}
              </p>
            </div>
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
