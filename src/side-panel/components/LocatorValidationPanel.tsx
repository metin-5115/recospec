import { AlertTriangle, CheckCircle2, Eye, RefreshCcw, ShieldCheck, XCircle } from 'lucide-react'
import type { LocatorValidationResult } from '@shared/types/messages'

interface LocatorValidationPanelProps {
  results: LocatorValidationResult[]
  durationMs: number
  isRunning: boolean
  error: string | null
  truncated?: number
  onRefresh: () => void
  onShow: (result: LocatorValidationResult) => void
  onUseFallback: (result: LocatorValidationResult, fallbackIndex: number) => void
}

function summarize(results: LocatorValidationResult[]): {
  matched: number
  total: number
  hasIssues: boolean
} {
  const matched = results.filter((r) => r.primary.status === 'matched').length
  return {
    matched,
    total: results.length,
    hasIssues: matched < results.length,
  }
}

function StatusIcon({ status }: { status: LocatorValidationResult['primary']['status'] }) {
  if (status === 'matched') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="matched" />
  }
  if (status === 'multiple') {
    return <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label="multiple matches" />
  }
  if (status === 'cross-origin') {
    return <ShieldCheck className="h-3.5 w-3.5 text-text-subtle" aria-label="cross-origin" />
  }
  return <XCircle className="h-3.5 w-3.5 text-danger" aria-label="not found" />
}

function statusLabel(status: LocatorValidationResult['primary']['status'], count: number): string {
  if (status === 'matched') return '1 match'
  if (status === 'multiple') return `${count} matches (ambiguous)`
  if (status === 'cross-origin') return 'cross-origin frame'
  return 'no match'
}

function firstWorkingFallback(result: LocatorValidationResult): number {
  return result.fallbacks.findIndex((f) => f.status === 'matched')
}

export function LocatorValidationPanel({
  results,
  durationMs,
  isRunning,
  error,
  truncated,
  onRefresh,
  onShow,
  onUseFallback,
}: LocatorValidationPanelProps) {
  const summary = summarize(results)
  const hasResults = results.length > 0
  const urlMismatch = results.some((r) => r.urlMismatch)

  return (
    <section
      role="region"
      aria-label="Locator validation results"
      className="border-t border-border bg-bg-elevated/40"
    >
      <header className="flex items-center justify-between gap-3 px-5 py-2.5">
        <div className="flex items-center gap-2 text-xs">
          {error ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-danger">
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {error}
            </span>
          ) : isRunning ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-text-muted">
              <RefreshCcw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Validating locators on the active tab…
            </span>
          ) : hasResults ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-text">
              <CheckCircle2
                className={`h-3.5 w-3.5 ${summary.hasIssues ? 'text-warning' : 'text-success'}`}
                aria-hidden="true"
              />
              {summary.matched}/{summary.total} locators matched in {durationMs}ms
              {truncated ? (
                <span className="ml-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning">
                  Validated first {results.length} of {truncated}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="font-medium text-text-muted">No validation run yet.</span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRunning}
          className="inline-flex items-center gap-1 rounded-md bg-bg px-2.5 py-1 text-xs font-medium text-text-muted shadow-sm transition-colors hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCcw className="h-3 w-3" aria-hidden="true" />
          Refresh
        </button>
      </header>

      {urlMismatch && (
        <p
          role="status"
          className="flex items-center gap-1.5 border-t border-warning/30 bg-warning-soft px-5 py-1.5 text-[11px] text-warning"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Active tab no longer matches the recorded origin — results may be unreliable.
        </p>
      )}

      {hasResults && (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto bg-bg/60">
          {results.map((result) => {
            const fallbackIdx = firstWorkingFallback(result)
            const showFallbackButton =
              (result.primary.status === 'missing' || result.primary.status === 'multiple') &&
              fallbackIdx >= 0
            const selectorText =
              typeof result.primary.selector === 'string'
                ? result.primary.selector
                : JSON.stringify(result.primary.selector)
            return (
              <li
                key={result.actionId}
                className="flex items-start gap-2 px-5 py-2 text-xs"
                data-testid={`validation-row-${result.actionId}`}
              >
                <span className="mt-0.5 shrink-0">
                  <StatusIcon status={result.primary.status} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-text-subtle">
                      #{result.index + 1}
                    </span>
                    <span className="truncate font-medium text-text">{result.label}</span>
                    <span className="rounded-md bg-bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                      {result.primary.strategy}
                    </span>
                    <span className="text-[10px] text-text-subtle">
                      {statusLabel(result.primary.status, result.primary.matchCount)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-text-muted">
                    {selectorText}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {result.primary.status !== 'missing' && (
                    <button
                      type="button"
                      onClick={() => onShow(result)}
                      className="inline-flex items-center gap-1 rounded-md bg-bg px-1.5 py-0.5 text-[11px] text-text-muted transition-colors hover:bg-accent hover:text-white"
                      aria-label={`Show ${result.label} on page`}
                    >
                      <Eye className="h-3 w-3" aria-hidden="true" />
                      Show me
                    </button>
                  )}
                  {showFallbackButton && (
                    <button
                      type="button"
                      onClick={() => onUseFallback(result, fallbackIdx)}
                      className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning transition-colors hover:bg-warning hover:text-white"
                      aria-label={`Switch ${result.label} to fallback locator`}
                    >
                      Use fallback
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
