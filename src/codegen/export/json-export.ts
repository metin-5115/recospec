import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import { maskSecretActions } from '../shared/secret-mask'
import { assertNoSecretValues } from '../shared/secret-guard'

export interface JsonExportPayload {
  exportedAt: number
  formatVersion: 1
  session: Session
  actions: RecordedAction[]
}

export interface JsonExportOptions {
  /**
   * Replace the value typed into every sensitive field with a placeholder (default). Only code that
   * keeps the payload in memory and masks it itself (prompt and LLM-context previews) turns it off.
   */
  maskSecrets?: boolean
}

export function buildJsonExport(
  session: Session,
  actions: RecordedAction[],
  options: JsonExportOptions = {},
): JsonExportPayload {
  if (options.maskSecrets === false) {
    return { exportedAt: Date.now(), formatVersion: 1, session, actions }
  }
  const masked = maskSecretActions(actions)
  const payload: JsonExportPayload = {
    exportedAt: Date.now(),
    formatVersion: 1,
    session,
    actions: masked.actions,
  }
  assertNoSecretValues(JSON.stringify(payload), masked.secrets, 'JSON export')
  return payload
}
