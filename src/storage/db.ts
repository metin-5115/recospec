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

export class PlayForgeDB extends Dexie {
  sessions!: Table<Session, string>
  actions!: Table<RecordedAction, string>
  generations!: Table<GeneratedCode, string>
  settings!: Table<UserSetting, string>

  constructor() {
    super(DB_NAME)
    this.version(DB_VERSION).stores({
      sessions: 'sessionId, startedAt, state, name',
      actions: 'actionId, sessionId, sequenceNumber, timestamp',
      generations: 'generationId, sessionId, framework, createdAt',
      settings: 'key',
    })
  }
}

export const db = new PlayForgeDB()
