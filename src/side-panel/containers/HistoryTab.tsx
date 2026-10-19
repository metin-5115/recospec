import { memo } from 'react'
import { useSessionStore } from '../sessionStore'
import type { Session } from '@shared/types/session'
import { SessionList } from '../components/SessionList'

interface HistoryTabProps {
  onLoad: (session: Session) => void
  onDelete: (sessionId: string) => void | Promise<void>
  onRename: (sessionId: string, name: string) => void | Promise<void>
  onExportJson: (sessionId: string) => void | Promise<void>
  onExportZip: (sessionId: string) => void | Promise<void>
  onCompare: (a: Session, b: Session) => void | Promise<void>
}

/** Saved sessions. Follows the session list, not the step list. */
export const HistoryTab = memo(function HistoryTab({
  onLoad,
  onDelete,
  onRename,
  onExportJson,
  onExportZip,
  onCompare,
}: HistoryTabProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSession?.sessionId ?? null)
  return (
    <SessionList
      sessions={sessions}
      activeSessionId={activeSessionId}
      onLoad={onLoad}
      onDelete={onDelete}
      onRename={onRename}
      onExportJson={onExportJson}
      onExportZip={onExportZip}
      onCompare={(a, b) => void onCompare(a, b)}
    />
  )
})
