import { useState, type KeyboardEvent } from 'react'
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
  recording: { label: 'REC', classes: 'bg-red-100 text-red-700' },
  paused: { label: 'PAUSE', classes: 'bg-amber-100 text-amber-700' },
  stopped: { label: 'DONE', classes: 'bg-green-100 text-green-700' },
  archived: { label: 'ARCH', classes: 'bg-gray-100 text-gray-500' },
}

function StateBadge({ state }: { state: SessionState }) {
  const { label, classes } = STATE_BADGE[state]
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tracking-wide ${classes}`}
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
      className={`group flex flex-col gap-1 border-b border-gray-100 px-4 py-2.5 transition-colors ${
        isLoaded ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <StateBadge state={session.state} />

        {editing ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border border-blue-400 px-1.5 py-0.5 text-sm outline-none"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800"
            title={session.name}
          >
            {session.name}
          </span>
        )}

        <span className="shrink-0 text-xs text-gray-400">{date}</span>
      </div>

      <div className="flex items-center gap-1">
        {!isLoaded && (
          <button
            onClick={onLoad}
            className="rounded px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
          >
            Load
          </button>
        )}

        <button
          onClick={() => setEditing(true)}
          className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-200"
        >
          Rename
        </button>

        {isStopped && (
          <>
            <button
              onClick={onExportJson}
              className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-200"
            >
              JSON
            </button>
            <button
              onClick={onExportZip}
              className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-200"
            >
              ZIP
            </button>
          </>
        )}

        {confirmDelete ? (
          <>
            <button
              onClick={() => {
                setConfirmDelete(false)
                onDelete()
              }}
              className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-200"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="ml-auto rounded px-2 py-0.5 text-xs font-medium text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
          >
            Delete
          </button>
        )}
      </div>
    </div>
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
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400">
        <span className="text-3xl">📋</span>
        <p className="text-sm">No sessions yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
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
