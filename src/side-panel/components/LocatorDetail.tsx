import type { ScoredLocator } from '@shared/types/locator'
import type { ElementSnapshot } from '@shared/types/action'

interface LocatorDetailProps {
  primary: ScoredLocator
  candidates: ScoredLocator[]
  snapshot?: ElementSnapshot
  onClose: () => void
}

function selectorString(loc: ScoredLocator): string {
  return typeof loc.selector === 'string' ? loc.selector : JSON.stringify(loc.selector)
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 50) return 'text-warning'
  return 'text-danger'
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

export function LocatorDetail({ primary, candidates, snapshot, onClose }: LocatorDetailProps) {
  const summary = snapshot ? snapshotSummary(snapshot) : null

  return (
    <div
      role="dialog"
      aria-label="Locator detail"
      className="absolute left-0 top-full z-10 mt-1 w-[360px] rounded-xl border border-border bg-bg p-3 shadow-lg"
      onMouseLeave={onClose}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
          {primary.strategy}
        </span>
        <span className={`text-[11px] font-mono font-semibold ${scoreColor(primary.score)}`}>
          {primary.score}/100
        </span>
      </div>
      <p className="mb-3 break-all font-mono text-[11px] text-text" title={selectorString(primary)}>
        {selectorString(primary)}
      </p>

      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
        All strategies
      </p>
      <table className="mb-3 w-full text-[10px]">
        <thead>
          <tr className="text-left text-text-subtle">
            <th className="pb-1 font-medium">Strategy</th>
            <th className="pb-1 font-medium">Score</th>
            <th className="pb-1 font-medium">Matches</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => (
            <tr key={`${c.strategy}-${i}`} className="border-t border-border">
              <td className="py-1 pr-2">
                <span className="rounded bg-bg-muted px-1 py-0.5 font-medium text-text-muted">
                  {c.strategy}
                </span>
              </td>
              <td className={`py-1 pr-2 font-mono font-semibold ${scoreColor(c.score)}`}>
                {c.score}
              </td>
              <td className="py-1 font-mono text-text-muted">{c.matchCount}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
