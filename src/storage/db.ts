import Dexie, { type Table } from 'dexie'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import { DB_NAME, DB_VERSION } from '@shared/constants'

interface GeneratedCode {
  generationId: string
  sessionId: string
  framework: string
  createdAt: number
  files: { name: string; content: string }[]
}

interface UserSetting {
  key: string
  value: unknown
}

/**
 * Pre-v2 row shape. Mirrors {@link Session} without the version-tree fields
 * we added in DB v2 (`iterationNumber`, `parentSessionId`, `flowSignature`).
 * Used only inside the upgrade callback.
 */
type LegacySession = Omit<Session, 'iterationNumber' | 'parentSessionId' | 'flowSignature'>

/**
 * Deterministic placeholder signature for sessions migrated up from v1.
 * The same logic ships in `session-repo.computeFlowSignature` for live
 * sessions, but during the upgrade callback we don't have access to the
 * stored actions — fall back to the start URL alone so existing rows still
 * group sensibly when the user re-records the same flow.
 */
function legacyPlaceholderSignature(startUrl: string): string {
  return `legacy::${startUrl}`
}

export class PlayForgeDB extends Dexie {
  sessions!: Table<Session, string>
  actions!: Table<RecordedAction, string>
  generations!: Table<GeneratedCode, string>
  settings!: Table<UserSetting, string>

  constructor() {
    super(DB_NAME)

    // v1 — historic schema (kept verbatim so Dexie can replay migrations
    // for users coming from <=v0.5.1).
    this.version(1).stores({
      sessions: 'sessionId, startedAt, state, name',
      actions: 'actionId, sessionId, sequenceNumber, timestamp',
      generations: 'generationId, sessionId, framework, createdAt',
      settings: 'key',
    })

    // v2 — add version-tree columns and a compound index so we can find
    // siblings quickly via `where('[parentSessionId+flowSignature]')`.
    this.version(DB_VERSION)
      .stores({
        sessions:
          'sessionId, startedAt, state, name, parentSessionId, flowSignature, [parentSessionId+flowSignature]',
        actions: 'actionId, sessionId, sequenceNumber, timestamp',
        generations: 'generationId, sessionId, framework, createdAt',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        // Backfill the version-tree fields on every pre-existing row so
        // queries that filter on them never see `undefined`.
        await tx
          .table<LegacySession, string>('sessions')
          .toCollection()
          .modify((session) => {
            const patched = session as unknown as Session
            if (patched.iterationNumber === undefined) patched.iterationNumber = 1
            if (patched.flowSignature === undefined) {
              patched.flowSignature = legacyPlaceholderSignature(patched.startUrl)
            }
            // parentSessionId stays undefined for legacy rows — they are
            // all roots of their own (single-node) version trees.
          })
      })
  }
}

export const db = new PlayForgeDB()
