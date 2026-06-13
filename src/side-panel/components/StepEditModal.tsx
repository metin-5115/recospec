import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import type { RecordedAction } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'
import type { StepPatch } from '@shared/types/messages'
import { useFocusTrap } from '@shared/hooks/useFocusTrap'

interface StepEditModalProps {
  step: RecordedAction
  onCancel: () => void
  onApply: (patch: StepPatch) => void
  onPickLocator: (candidate: ScoredLocator) => void
}

type EditTab = 'fields' | 'locator'

function selectorString(loc: ScoredLocator): string {
  return typeof loc.selector === 'string' ? loc.selector : JSON.stringify(loc.selector)
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 50) return 'text-warning'
  return 'text-danger'
}

function getCandidates(step: RecordedAction): ScoredLocator[] {
  if (!step.target) return []
  const all = step.target.allCandidates ?? [
    step.target.primaryLocator,
    ...step.target.fallbackLocators,
  ]
  return all
}

function isPrimary(candidate: ScoredLocator, primary: ScoredLocator): boolean {
  return (
    candidate.strategy === primary.strategy &&
    JSON.stringify(candidate.selector) === JSON.stringify(primary.selector)
  )
}

export function StepEditModal({ step, onCancel, onApply, onPickLocator }: StepEditModalProps) {
  const supportsLocator = Boolean(step.target) && step.type !== 'network'
  const [tab, setTab] = useState<EditTab>('fields')

  const initialValue = (step.payload?.['value'] as string | undefined) ?? ''
  const initialKey = (step.payload?.['key'] as string | undefined) ?? ''
  const initialDelay = (step.payload?.['delay'] as number | undefined) ?? 0
  const initialWaitTimeout =
    (step.payload?.['wait'] as { timeoutMs?: number } | undefined)?.timeoutMs ?? 10_000

  const [value, setValue] = useState(initialValue)
  const [key, setKey] = useState(initialKey)
  const [delay, setDelay] = useState<number>(initialDelay)
  const [waitTimeout, setWaitTimeout] = useState<number>(initialWaitTimeout)

  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, { onEscape: onCancel })

  const candidates = useMemo(() => getCandidates(step), [step])
  const primary = step.target?.primaryLocator

  function handleApply(e: FormEvent) {
    e.preventDefault()
    const nextPayload = { ...(step.payload ?? {}) } as Record<string, unknown>
    if (step.type === 'fill') nextPayload.value = value
    if (step.type === 'keypress') nextPayload.key = key
    if (step.type === 'wait') {
      const prev = (nextPayload.wait as { reason?: string } | undefined) ?? {}
      const safeTimeout = Number.isFinite(waitTimeout) && waitTimeout > 0 ? waitTimeout : 10_000
      nextPayload.wait = { ...prev, timeoutMs: safeTimeout }
    }
    nextPayload.delay = Number.isFinite(delay) && delay > 0 ? delay : undefined
    if (nextPayload.delay === undefined) delete nextPayload.delay
    onApply({ payload: nextPayload })
  }

  return (
    <div
      role="dialog"
      aria-label="Edit step"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 motion-safe:animate-in motion-safe:fade-in"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl border border-border bg-bg p-5 shadow-xl outline-none motion-safe:animate-in motion-safe:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text">Edit step</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              <span className="font-mono">{step.type}</span>
              {step.target?.userOverridden && (
                <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  locator overridden
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-subtle hover:bg-bg-muted hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {supportsLocator && (
          <div className="mb-4 flex gap-1 border-b border-border">
            <TabButton active={tab === 'fields'} onClick={() => setTab('fields')}>
              Fields
            </TabButton>
            <TabButton active={tab === 'locator'} onClick={() => setTab('locator')}>
              Locator{candidates.length > 0 ? ` (${candidates.length})` : ''}
            </TabButton>
          </div>
        )}

        {tab === 'fields' && (
          <form onSubmit={handleApply} className="space-y-4">
            {step.type === 'fill' && (
              <Field label="Value">
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-1.5 font-mono text-sm text-text outline-none transition-colors focus:border-accent"
                  aria-label="Step value"
                />
              </Field>
            )}
            {step.type === 'keypress' && (
              <Field label="Key">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="e.g. Enter, Tab, Escape"
                  className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-1.5 font-mono text-sm text-text outline-none transition-colors focus:border-accent"
                  aria-label="Step key"
                />
              </Field>
            )}
            {step.type === 'wait' && (
              <Field label="Wait timeout (ms)" hint="Caps how long the generated test waits.">
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={waitTimeout}
                  onChange={(e) => setWaitTimeout(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-1.5 font-mono text-sm text-text outline-none transition-colors focus:border-accent"
                  aria-label="Wait timeout"
                />
              </Field>
            )}
            <Field label="Delay before action (ms)" hint="Optional. Leave 0 to skip.">
              <input
                type="number"
                min={0}
                step={50}
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-1.5 font-mono text-sm text-text outline-none transition-colors focus:border-accent"
                aria-label="Step delay"
              />
            </Field>
            {step.type !== 'fill' && step.type !== 'keypress' && step.type !== 'wait' && (
              <p className="rounded-lg bg-bg-muted px-3 py-2 text-xs text-text-muted">
                {step.type === 'network'
                  ? 'Network steps only support delay tweaks here.'
                  : 'No value to edit for this action type.'}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Apply
              </button>
            </div>
          </form>
        )}

        {tab === 'locator' && primary && (
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-text-subtle">
              Pick which locator the test should use. The current primary stays as a fallback.
            </p>
            <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {candidates.map((c, i) => {
                const isCurrent = isPrimary(c, primary)
                return (
                  <li
                    key={`${c.strategy}-${i}`}
                    className={`rounded-lg border px-3 py-2 ${
                      isCurrent ? 'border-accent bg-accent-soft' : 'border-border bg-bg-elevated'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                        {c.strategy}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[11px] font-semibold ${scoreColor(c.score)}`}
                        >
                          {c.score}/100
                        </span>
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => onPickLocator(c)}
                            className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-accent-hover"
                          >
                            Use this
                          </button>
                        )}
                        {isCurrent && (
                          <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                            Current
                          </span>
                        )}
                      </div>
                    </div>
                    <p
                      className="break-all font-mono text-[11px] text-text"
                      title={selectorString(c)}
                    >
                      {selectorString(c)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-text-subtle">
                      {c.matchCount} match{c.matchCount === 1 ? '' : 'es'}
                    </p>
                  </li>
                )
              })}
            </ul>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  hint?: string
  children: ReactNode
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-text-subtle">{hint}</span>}
    </label>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  children: ReactNode
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative -mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
