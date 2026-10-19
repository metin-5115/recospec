import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'

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
