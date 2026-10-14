import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import { slugifyFilename } from '@shared/slug'

export interface JsonExportPayload {
  exportedAt: number
  formatVersion: 1
  session: Session
  actions: RecordedAction[]
}

export function buildJsonExport(session: Session, actions: RecordedAction[]): JsonExportPayload {
  return {
    exportedAt: Date.now(),
    formatVersion: 1,
    session,
    actions,
  }
}

export function downloadJsonExport(session: Session, actions: RecordedAction[]): void {
  const payload = buildJsonExport(session, actions)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugifyFilename(session.name)}_${session.sessionId.slice(0, 8)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
