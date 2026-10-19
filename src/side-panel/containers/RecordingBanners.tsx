import { memo, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CircleDot, GitBranch, X } from 'lucide-react'
import type { RecordedAction, NetworkPayload } from '@shared/types/action'
import { classifyStep, type LocatorQuality } from '@shared/locator-quality'
import type { IterationSuggestion } from '../hooks/useSessionHistory'
import { useSessionStore } from '../sessionStore'
import type { Session } from '@shared/types/session'

interface RecordingBannersProps {
  activeSession: Session | null
  isRecording: boolean
  isPaused: boolean
  iterationSuggestion: IterationSuggestion | null
  onAcceptIteration: () => void
  onDismissIteration: () => void
}

/** Live status strip, last-step line and the iteration suggestion shown under the header. */
export const RecordingBanners = memo(function RecordingBanners({
  activeSession,
  isRecording,
  isPaused,
  iterationSuggestion,
  onAcceptIteration,
  onDismissIteration,
}: RecordingBannersProps) {
  const isActive = isRecording || isPaused
  // Narrow selectors: this strip is one of the few places that has to follow every new step.
  const stepCount = useSessionStore((s) => s.steps.length)
  const lastStep = useSessionStore((s) => s.steps.at(-1) ?? null)
  const lastStepSummary = useMemo(() => (lastStep ? formatLastStep(lastStep) : null), [lastStep])
  return (
    <>
      {isActive && activeSession && (
        <LiveRecordingBanner
          startUrl={activeSession.startUrl}
          startedAt={activeSession.startedAt}
          stepCount={stepCount}
          isPaused={isPaused}
        />
      )}

      {isRecording && lastStepSummary && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Last recorded step"
          className="flex items-center gap-2 border-b border-border bg-bg-elevated/40 px-5 py-1.5 text-[11px] text-text-muted"
        >
          <span className="font-semibold uppercase tracking-wider text-text-subtle">Last</span>
          <span className="font-mono text-text">{lastStepSummary.action}</span>
          {lastStepSummary.target && (
            <span className="truncate font-mono text-text-muted" title={lastStepSummary.target}>
              {lastStepSummary.target}
            </span>
          )}
          {lastStepSummary.quality.level !== 'ok' && (
            <span
              className={`ml-auto inline-flex shrink-0 items-center gap-1 font-medium ${
                lastStepSummary.quality.level === 'none' ? 'text-danger' : 'text-warning'
              }`}
              title={lastStepSummary.quality.hint ?? undefined}
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {lastStepSummary.quality.hint}
            </span>
          )}
        </div>
      )}

      {iterationSuggestion && (
        <div
          role="status"
          aria-label="Iteration suggested"
          className="flex items-start gap-2 border-b border-accent/30 bg-accent-soft px-5 py-2 text-xs text-text"
        >
          <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold text-text">
              Looks like an iteration of{' '}
              <span className="font-mono text-accent">{iterationSuggestion.parentName}</span>
            </p>
            <p className="text-text-muted">
              Last recorded{' '}
              {new Date(iterationSuggestion.parentTimestamp).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · link as{' '}
              <span className="font-mono">v{iterationSuggestion.parentIterationNumber + 1}</span>?
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onAcceptIteration()}
              className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:opacity-90"
            >
              Link as v{iterationSuggestion.parentIterationNumber + 1}
            </button>
            <button
              type="button"
              onClick={() => onDismissIteration()}
              className="rounded-md p-1 text-text-muted hover:bg-bg-muted hover:text-text"
              aria-label="Dismiss iteration suggestion"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  )
})

interface LiveRecordingBannerProps {
  startUrl: string
  startedAt: number
  stepCount: number
  isPaused: boolean
}

function LiveRecordingBanner({
  startUrl,
  startedAt,
  stepCount,
  isPaused,
}: LiveRecordingBannerProps) {
  const [elapsedSec, setElapsedSec] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
  )
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  let host = startUrl
  let path = ''
  try {
    const u = new URL(startUrl)
    host = u.host
    path = u.pathname === '/' ? '' : u.pathname
  } catch {
    /* keep raw url */
  }
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
  const ss = String(elapsedSec % 60).padStart(2, '0')
  const dotClass = isPaused ? 'fill-warning text-warning' : 'fill-danger text-danger animate-pulse'
  const dotLabel = isPaused ? 'Recording paused' : 'Recording'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${dotLabel} on ${host}${path}, ${stepCount} steps, ${mm} minutes ${ss} seconds`}
      className="flex items-center gap-3 border-b border-border bg-bg-elevated/40 px-5 py-1.5 text-[11px] text-text-muted"
    >
      <CircleDot className={`h-2.5 w-2.5 ${dotClass}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-mono text-text" title={startUrl}>
        {host}
        {path && <span className="text-text-muted">{path}</span>}
      </span>
      <span className="shrink-0 font-mono tabular-nums text-text-muted">
        <span className="font-semibold text-text">{stepCount}</span> step
        {stepCount === 1 ? '' : 's'}
      </span>
      <span className="shrink-0 font-mono tabular-nums text-text-muted" aria-hidden="true">
        {mm}:{ss}
      </span>
    </div>
  )
}

interface LastStepSummary {
  action: string
  target: string | null
  quality: LocatorQuality
}

function formatLastStep(step: RecordedAction): LastStepSummary {
  const quality = classifyStep(step)
  if (step.type === 'network') {
    const np = (step.payload ?? {}) as Partial<NetworkPayload>
    const method = (np.method ?? 'GET').toUpperCase()
    let path = np.url ?? ''
    try {
      if (np.url) path = new URL(np.url).pathname
    } catch {
      /* keep raw url */
    }
    return { action: 'network', target: `${method} ${path}`.trim() || null, quality }
  }
  const primary = step.target?.primaryLocator
  if (primary) {
    const selector =
      typeof primary.selector === 'string' ? primary.selector : JSON.stringify(primary.selector)
    return { action: step.type, target: selector, quality }
  }
  return { action: step.type, target: null, quality }
}
