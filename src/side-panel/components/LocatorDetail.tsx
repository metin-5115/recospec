import { Check } from 'lucide-react'
import type { ScoredLocator } from '@shared/types/locator'
import type { ElementSnapshot } from '@shared/types/action'
import { STRATEGY_DISPLAY_NAME } from '@shared/constants'
import { STRATEGY_BADGE_CLASS, STRATEGY_HELP_TEXT, scoreTier } from './locator-presentation'

interface LocatorDetailProps {
  primary: ScoredLocator
  candidates: ScoredLocator[]
  snapshot?: ElementSnapshot
  onClose: () => void
  /** Called when the user clicks "Use this" on a non-primary candidate. */
  onPickLocator?: (candidate: ScoredLocator) => void
}

function selectorString(loc: ScoredLocator): string {
  return typeof loc.selector === 'string' ? loc.selector : JSON.stringify(loc.selector)
}

function scoreTextColor(score: number): string {
  return scoreTier(score).textClass
}

function scoreBarColor(score: number): string {
  return scoreTier(score).bgClass
}

function isSameLocator(a: ScoredLocator, b: ScoredLocator): boolean {
  if (a.strategy !== b.strategy) return false
  const aSel = typeof a.selector === 'string' ? a.selector : JSON.stringify(a.selector)
  const bSel = typeof b.selector === 'string' ? b.selector : JSON.stringify(b.selector)
  return aSel === bSel
}

function snapshotSummary(snap: ElementSnapshot): {
  tag: string
  text?: string
  id?: string
  classes?: string
} {
  const tag = snap.tagName.toLowerCase()
  const text = snap.textContent?.trim()
  const id = snap.attributes.id
  const classes = snap.attributes.class
  return {
    tag,
    ...(text && { text }),
    ...(id && { id }),
    ...(classes && { classes }),
  }
}

export function LocatorDetail({
  primary,
  candidates,
  snapshot,
  onClose,
  onPickLocator,
}: LocatorDetailProps) {
  const summary = snapshot ? snapshotSummary(snapshot) : null
  const primaryTier = scoreTier(primary.score)

  return (
    <div
      role="dialog"
      aria-label="Locator detail"
      className="absolute left-0 top-full z-10 mt-1 w-[360px] rounded-xl border border-border bg-bg p-3 shadow-lg"
      onMouseLeave={onClose}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STRATEGY_BADGE_CLASS[primary.strategy]}`}
        >
          {STRATEGY_DISPLAY_NAME[primary.strategy]}
        </span>
        <span className={`text-[11px] font-mono font-semibold ${scoreTextColor(primary.score)}`}>
          {primary.score}/100 · {primaryTier.label}
        </span>
      </div>
      <p className="mb-1 text-[10px] italic text-text-muted">
        {STRATEGY_HELP_TEXT[primary.strategy]}
      </p>
      <p className="mb-3 break-all font-mono text-[11px] text-text" title={selectorString(primary)}>
        {selectorString(primary)}
      </p>

      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
        All strategies
      </p>
      <ul className="mb-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {candidates.map((c, i) => {
          const isPrimary = isSameLocator(c, primary)
          const selector = selectorString(c)
          return (
            <li
              key={`${c.strategy}-${i}`}
              className={`rounded-lg border px-2 py-1.5 transition-colors ${
                isPrimary
                  ? 'border-accent/40 bg-accent-soft/40'
                  : 'border-border bg-bg-muted/40 hover:bg-bg-muted'
              }`}
              title={STRATEGY_HELP_TEXT[c.strategy]}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STRATEGY_BADGE_CLASS[c.strategy]}`}
                  >
                    {STRATEGY_DISPLAY_NAME[c.strategy]}
                  </span>
                  {isPrimary && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
                      title="Currently used locator"
                    >
                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                      primary
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`font-mono text-[10px] font-semibold ${scoreTextColor(c.score)}`}
                  >
                    {c.score}
                  </span>
                  <span
                    className="font-mono text-[10px] text-text-subtle"
                    title={`${c.matchCount} match${c.matchCount === 1 ? '' : 'es'}`}
                  >
                    {c.matchCount}×
                  </span>
                  {onPickLocator && !isPrimary && (
                    <button
                      type="button"
                      onClick={() => onPickLocator(c)}
                      className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm transition-colors hover:opacity-90"
                      title={`Use ${c.strategy} as the primary locator`}
                    >
                      Use this
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-muted">
                <div
                  className={`h-full rounded-full ${scoreBarColor(c.score)}`}
                  style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                />
              </div>
              <p
                className="mt-1 truncate break-all font-mono text-[10px] text-text-muted"
                title={selector}
              >
                {selector}
              </p>
            </li>
          )
        })}
      </ul>

      {summary && (
        <>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
            Element snapshot
          </p>
          <div className="rounded-lg bg-bg-muted px-2 py-1.5 font-mono text-[10px] text-text-muted">
            <div>
              <span className="text-text">{`<${summary.tag}>`}</span>
            </div>
            {summary.text && (
              <div className="truncate" title={summary.text}>
                <span className="text-text-subtle">text:</span>{' '}
                {`"${summary.text.slice(0, 60)}${summary.text.length > 60 ? '…' : ''}"`}
              </div>
            )}
            {summary.id && (
              <div className="truncate" title={summary.id}>
                <span className="text-text-subtle">id:</span> #{summary.id}
              </div>
            )}
            {summary.classes && (
              <div className="truncate" title={summary.classes}>
                <span className="text-text-subtle">class:</span> .
                {summary.classes.split(/\s+/).join(' .')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
