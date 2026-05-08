import { useState, type ComponentType, type KeyboardEvent, type SVGProps } from 'react'
import { Archive, FileJson, History, Pencil, Play, Trash2 } from 'lucide-react'
import type { Session, SessionState } from '@shared/types/session'

interface SessionListProps {
  sessions: Session[]
  activeSessionId: string | null
  onLoad: (session: Session) => void
  onDelete: (sessionId: string) => void
  onRename: (sessionId: string, name: string) => void
  onExportJson: (sessionId: string) => void
  onExportZip: (sessionId: string) => void
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
  onLoad: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onExportJson: () => void
  onExportZip: () => void
}

function SessionItem({
  session,
  isLoaded,
  onLoad,
  onDelete,
  onRename,
  onExportJson,
  onExportZip,
}: ItemProps) {
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(session.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  return (
    <div
      className={`group flex flex-col gap-2 rounded-xl px-4 py-3 transition-colors ${
        isLoaded ? 'bg-accent-soft ring-1 ring-accent/30' : 'hover:bg-bg-elevated'
      }`}
    >
      <div className="flex items-center gap-2">
        <StateBadge state={session.state} />

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
}: SessionListProps) {
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

  return (
    <div className="flex flex-col gap-1.5 p-2">
      {sessions.map((session) => (
        <SessionItem
          key={session.sessionId}
          session={session}
          isLoaded={session.sessionId === activeSessionId}
          onLoad={() => onLoad(session)}
          onDelete={() => onDelete(session.sessionId)}
          onRename={(name) => onRename(session.sessionId, name)}
          onExportJson={() => onExportJson(session.sessionId)}
          onExportZip={() => onExportZip(session.sessionId)}
        />
      ))}
    </div>
  )
}
