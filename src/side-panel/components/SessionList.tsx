import {
  useMemo,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactElement,
  type SVGProps,
} from 'react'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  FileJson,
  GitBranch,
  GitCompare,
  History,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'
import type { Session, SessionState } from '@shared/types/session'

interface SessionListProps {
  sessions: Session[]
  activeSessionId: string | null
  onLoad: (session: Session) => void
  onDelete: (sessionId: string) => void
  onRename: (sessionId: string, name: string) => void
  onExportJson: (sessionId: string) => void
  onExportZip: (sessionId: string) => void
  /** Open the side-by-side diff modal between two sessions in the same tree. */
  onCompare?: (sessionA: Session, sessionB: Session) => void
}

interface TreeNode {
  session: Session
  children: TreeNode[]
  /** All descendants of this root (excluding the root itself). Empty for leaves. */
  family: Session[]
}

/**
 * Build a forest of version trees from the flat session list. Roots are
 * sessions with no `parentSessionId`; orphaned children (whose parent was
 * deleted) re-surface as roots so they remain visible.
 */
function buildForest(sessions: Session[]): TreeNode[] {
  const byId = new Map(sessions.map((s) => [s.sessionId, s]))
  const childrenByParent = new Map<string, Session[]>()
  for (const s of sessions) {
    const parentId = s.parentSessionId
    if (parentId && byId.has(parentId)) {
      const list = childrenByParent.get(parentId) ?? []
      list.push(s)
      childrenByParent.set(parentId, list)
    }
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.iterationNumber - b.iterationNumber || a.startedAt - b.startedAt)
  }

  const buildNode = (session: Session): TreeNode => {
    const children = (childrenByParent.get(session.sessionId) ?? []).map(buildNode)
    const family: Session[] = []
    for (const child of children) {
      family.push(child.session, ...child.family)
    }
    return { session, children, family }
  }

  return sessions
    .filter((s) => !s.parentSessionId || !byId.has(s.parentSessionId))
    .sort((a, b) => b.startedAt - a.startedAt)
    .map(buildNode)
}

const STATE_BADGE: Record<SessionState, { label: string; classes: string }> = {
  recording: { label: 'REC', classes: 'bg-danger-soft text-danger' },
  paused: { label: 'PAUSE', classes: 'bg-warning-soft text-warning' },
  stopped: { label: 'DONE', classes: 'bg-success-soft text-success' },
  archived: { label: 'ARCH', classes: 'bg-bg-muted text-text-muted' },
}

function StateBadge({ state }: { state: SessionState }) {
  const { label, classes } = STATE_BADGE[state]
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${classes}`}
    >
      {label}
    </span>
  )
}

interface ItemProps {
  session: Session
  isLoaded: boolean
  /** 0 = root, increases by 1 per level. Used for left indent. */
  depth: number
  /** Number of direct children — drives the expand toggle. */
  childCount: number
  expanded: boolean
  onToggleExpanded: () => void
  /** Sibling sessions in the same version tree, used to populate "Compare with…". */
  compareCandidates: Session[]
  onLoad: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onExportJson: () => void
  onExportZip: () => void
  onCompare?: (other: Session) => void
}

function SessionItem({
  session,
  isLoaded,
  depth,
  childCount,
  expanded,
  onToggleExpanded,
  compareCandidates,
  onLoad,
  onDelete,
  onRename,
  onExportJson,
  onExportZip,
  onCompare,
}: ItemProps) {
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(session.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [compareMenuOpen, setCompareMenuOpen] = useState(false)

  const commitRename = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== session.name) onRename(trimmed)
    setEditing(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') {
      setNameInput(session.name)
      setEditing(false)
    }
  }

  const date = new Date(session.startedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const isStopped = session.state === 'stopped' || session.state === 'archived'

  const showExpandToggle = childCount > 0
  const indentPx = depth * 16

  return (
    <div
      className={`group flex flex-col gap-2 rounded-xl px-4 py-3 transition-colors ${
        isLoaded ? 'bg-accent-soft ring-1 ring-accent/30' : 'hover:bg-bg-elevated'
      }`}
      style={indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}
      data-testid={`session-row-${session.sessionId}`}
    >
      <div className="flex items-center gap-2">
        {showExpandToggle ? (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="-ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted hover:bg-bg-muted hover:text-text"
            aria-label={expanded ? 'Collapse versions' : 'Expand versions'}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        ) : depth > 0 ? (
          <GitBranch className="h-3 w-3 shrink-0 text-text-subtle" aria-label="iteration" />
        ) : null}

        <StateBadge state={session.state} />

        {session.iterationNumber > 1 && (
          <span
            className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] text-accent"
            title={`Iteration ${session.iterationNumber} of this flow`}
          >
            v{session.iterationNumber}
          </span>
        )}

        {editing ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-accent bg-bg px-2 py-0.5 text-sm text-text outline-none ring-2 ring-accent/30"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-sm font-semibold text-text"
            title={session.name}
          >
            {session.name}
          </span>
        )}

        <span className="shrink-0 text-[11px] text-text-subtle">{date}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {!isLoaded && <ActionPill onClick={onLoad} icon={Play} label="Load" tone="accent" />}

        <ActionPill onClick={() => setEditing(true)} icon={Pencil} label="Rename" tone="muted" />

        {isStopped && (
          <>
            <ActionPill onClick={onExportJson} icon={FileJson} label="JSON" tone="muted" />
            <ActionPill onClick={onExportZip} icon={Archive} label="ZIP" tone="muted" />
          </>
        )}

        {onCompare && compareCandidates.length > 0 && (
          <div className="relative">
            <ActionPill
              onClick={() => setCompareMenuOpen((v) => !v)}
              icon={GitCompare}
              label="Compare"
              tone="muted"
            />
            {compareMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-bg shadow-lg"
                onMouseLeave={() => setCompareMenuOpen(false)}
              >
                <p className="border-b border-border bg-bg-muted px-2 py-1 text-[10px] uppercase tracking-wide text-text-subtle">
                  Compare with…
                </p>
                {compareCandidates.map((other) => (
                  <button
                    key={other.sessionId}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCompareMenuOpen(false)
                      onCompare(other)
                    }}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] text-text hover:bg-accent-soft"
                  >
                    <span className="font-mono text-[10px] text-accent">
                      v{other.iterationNumber}
                    </span>
                    <span className="truncate" title={other.name}>
                      {other.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {confirmDelete ? (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                setConfirmDelete(false)
                onDelete()
              }}
              className="inline-flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-2 py-1 text-[11px] text-text-muted hover:bg-bg-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-subtle opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
            aria-label="Delete session"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

interface ActionPillProps {
  onClick: () => void
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  tone: 'accent' | 'muted'
}

function ActionPill({ onClick, icon: Icon, label, tone }: ActionPillProps) {
  const palette =
    tone === 'accent'
      ? 'bg-accent-soft text-accent hover:bg-accent hover:text-white'
      : 'text-text-muted hover:bg-bg-muted hover:text-text'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${palette}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </button>
  )
}

export function SessionList({
  sessions,
  activeSessionId,
  onLoad,
  onDelete,
  onRename,
  onExportJson,
  onExportZip,
  onCompare,
}: SessionListProps) {
  const forest = useMemo(() => buildForest(sessions), [sessions])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
          <History className="h-7 w-7 text-accent" aria-hidden="true" />
        </div>
        <p className="mb-1 text-base font-semibold text-text">No sessions yet</p>
        <p className="text-sm text-text-muted">
          Recorded sessions will appear here once you stop recording.
        </p>
      </div>
    )
  }

  const toggle = (sessionId: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  const rows: ReactElement[] = []
  const walk = (node: TreeNode, depth: number, family: Session[]): void => {
    const expanded = !collapsed.has(node.session.sessionId)
    const compareCandidates = family.filter((s) => s.sessionId !== node.session.sessionId)
    rows.push(
      <SessionItem
        key={node.session.sessionId}
        session={node.session}
        isLoaded={node.session.sessionId === activeSessionId}
        depth={depth}
        childCount={node.children.length}
        expanded={expanded}
        onToggleExpanded={() => toggle(node.session.sessionId)}
        compareCandidates={compareCandidates}
        onLoad={() => onLoad(node.session)}
        onDelete={() => onDelete(node.session.sessionId)}
        onRename={(name) => onRename(node.session.sessionId, name)}
        onExportJson={() => onExportJson(node.session.sessionId)}
        onExportZip={() => onExportZip(node.session.sessionId)}
        onCompare={onCompare ? (other) => onCompare(node.session, other) : undefined}
      />,
    )
    if (expanded) {
      for (const child of node.children) walk(child, depth + 1, family)
    }
  }

  for (const root of forest) {
    const family = [root.session, ...root.family]
    walk(root, 0, family)
  }

  return <div className="flex flex-col gap-1.5 p-2">{rows}</div>
}
