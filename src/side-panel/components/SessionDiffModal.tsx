import { useMemo } from 'react'
import { Download, X } from 'lucide-react'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'
import {
  diffSessions,
  summarizeDiff,
  type SessionDiff,
  type SessionDiffChangedEntry,
} from '@codegen/diff/session-differ'

interface SessionDiffModalProps {
  sessionA: Session
  actionsA: RecordedAction[]
  sessionB: Session
  actionsB: RecordedAction[]
  onClose: () => void
}

type RowKind = 'pair' | 'added' | 'removed'

interface DiffRow {
  kind: RowKind
  a?: RecordedAction
  b?: RecordedAction
  change?: SessionDiffChangedEntry
}

function buildRows(a: RecordedAction[], b: RecordedAction[], diff: SessionDiff): DiffRow[] {
  // Walk the two sequences interleaving paired indices with added/removed
  // singletons. The differ already returns paired indices in ascending order
  // on the `a` side, so we sweep both arrays once.
  const rows: DiffRow[] = []
  const pairs = diff.pairs
  const changeByIndex = new Map(
    diff.changed.map((c) => {
      const aIdx = a.findIndex((s) => s.actionId === c.previousActionId)
      return [aIdx, c] as const
    }),
  )
  let ai = 0
  let bi = 0
  for (const [pa, pb] of pairs) {
    while (ai < pa && bi <= pb) {
      // Emit "removed" rows on the `a` side until we reach the pair.
      if (bi < pb && pairs.some(([, j]) => j === bi)) break
      rows.push({ kind: 'removed', a: a[ai] })
      ai += 1
    }
    while (bi < pb && ai >= pa) {
      rows.push({ kind: 'added', b: b[bi] })
      bi += 1
    }
    rows.push({
      kind: 'pair',
      a: a[pa],
      b: b[pb],
      change: changeByIndex.get(pa),
    })
    ai = pa + 1
    bi = pb + 1
  }
  while (ai < a.length) {
    rows.push({ kind: 'removed', a: a[ai] })
    ai += 1
  }
  while (bi < b.length) {
    rows.push({ kind: 'added', b: b[bi] })
    bi += 1
  }
  return rows
}

function selectorOf(step: RecordedAction | undefined): string {
  if (!step?.target) return '—'
  const sel = step.target.primaryLocator.selector
  return typeof sel === 'string' ? sel : JSON.stringify(sel)
}

function strategyOf(step: RecordedAction | undefined): string {
  return step?.target?.primaryLocator.strategy ?? '—'
}

function valueOf(step: RecordedAction | undefined): string {
  if (!step?.payload) return ''
  const v = step.payload
  if (typeof v === 'object' && v !== null) {
    const keys = ['value', 'key', 'text']
    for (const key of keys) {
      if (typeof (v as Record<string, unknown>)[key] === 'string') {
        return String((v as Record<string, unknown>)[key])
      }
    }
    return JSON.stringify(v)
  }
  return String(v)
}

function StepCell({
  step,
  tone,
  change,
  side,
}: {
  step: RecordedAction | undefined
  tone: 'neutral' | 'add' | 'remove' | 'change'
  change?: SessionDiffChangedEntry
  side: 'a' | 'b'
}) {
  const palette: Record<typeof tone, string> = {
    neutral: 'bg-bg/50 border-border',
    add: 'bg-success-soft border-success/40',
    remove: 'bg-danger-soft border-danger/40',
    change: 'bg-warning-soft border-warning/40',
  }
  if (!step) {
    return (
      <div
        className={`flex h-full items-center justify-center rounded-md border border-dashed border-border bg-bg/30 text-[10px] uppercase tracking-wide text-text-subtle`}
        aria-hidden="true"
      >
        —
      </div>
    )
  }
  const locatorChanged = change?.locatorChanged ?? false
  const valueChanged = change?.valueChanged ?? false
  return (
    <div className={`rounded-md border px-2 py-1.5 text-[11px] ${palette[tone]}`}>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-text-subtle">#{step.sequenceNumber + 1}</span>
        <span className="font-semibold text-text">{step.type}</span>
        <span className="rounded bg-bg-muted px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-text-muted">
          {strategyOf(step)}
        </span>
      </div>
      <p
        className={`mt-0.5 truncate font-mono text-[10px] ${
          locatorChanged ? 'text-warning' : 'text-text-muted'
        }`}
        title={selectorOf(step)}
      >
        {selectorOf(step)}
      </p>
      {valueOf(step) && (
        <p
          className={`mt-0.5 truncate text-[10px] ${
            valueChanged ? 'text-warning' : 'text-text-subtle'
          }`}
          title={valueOf(step)}
        >
          {side === 'a' ? '→ ' : '← '}
          {valueOf(step)}
        </p>
      )}
    </div>
  )
}

export function SessionDiffModal({
  sessionA,
  actionsA,
  sessionB,
  actionsB,
  onClose,
}: SessionDiffModalProps) {
  const diff = useMemo(() => diffSessions(actionsA, actionsB), [actionsA, actionsB])
  const summary = useMemo(() => summarizeDiff(diff), [diff])
  const rows = useMemo(() => buildRows(actionsA, actionsB, diff), [actionsA, actionsB, diff])

  const exportJson = (): void => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            a: { sessionId: sessionA.sessionId, name: sessionA.name },
            b: { sessionId: sessionB.sessionId, name: sessionB.name },
            summary,
            diff,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `playforge-diff-${sessionA.sessionId.slice(0, 6)}-vs-${sessionB.sessionId.slice(0, 6)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Session diff"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-bg shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-text">
              {sessionA.name} <span className="text-text-subtle">({actionsA.length} steps)</span>
              <span className="px-2 text-text-subtle">vs</span>
              {sessionB.name} <span className="text-text-subtle">({actionsB.length} steps)</span>
            </h2>
            <p className="mt-0.5 text-[11px] text-text-muted">
              <span className="text-success">+{summary.added}</span>{' '}
              <span className="text-danger">−{summary.removed}</span>{' '}
              <span className="text-warning">~{summary.changed}</span>{' '}
              <span className="text-text-subtle">·{summary.unchanged} unchanged</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex items-center gap-1 rounded-md bg-bg-muted px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-accent hover:text-white"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              Export diff as JSON
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-text-muted hover:bg-bg-muted hover:text-text"
              aria-label="Close diff"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 border-b border-border bg-bg-elevated/30 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          <span>v{sessionA.iterationNumber}</span>
          <span>v{sessionB.iterationNumber}</span>
        </div>

        <ul className="flex-1 space-y-1 overflow-y-auto p-3">
          {rows.map((row, idx) => {
            const isChange = row.kind === 'pair' && Boolean(row.change)
            return (
              <li
                key={idx}
                className="grid grid-cols-2 gap-2"
                data-testid={`diff-row-${row.kind}${isChange ? '-changed' : ''}`}
              >
                <StepCell
                  step={row.a}
                  tone={row.kind === 'removed' ? 'remove' : isChange ? 'change' : 'neutral'}
                  change={row.change}
                  side="a"
                />
                <StepCell
                  step={row.b}
                  tone={row.kind === 'added' ? 'add' : isChange ? 'change' : 'neutral'}
                  change={row.change}
                  side="b"
                />
              </li>
            )
          })}
          {rows.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-text-muted">
              These two sessions are step-for-step identical.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
