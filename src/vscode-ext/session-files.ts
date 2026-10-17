import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SESSIONS_GITIGNORE_CONTENT } from '@shared/constants'

const GITIGNORE_FILENAME = '.gitignore'

/**
 * Recordings hold the values typed during a session (including passwords), and the Record
 * command writes them into the user's project. A `.gitignore` inside the sessions folder hides
 * them from git without editing the project's own `.gitignore`, wherever the repo root is.
 *
 * Returns true when the file was created; an existing one is never overwritten.
 */
export function ensureSessionsDirIgnored(sessionsDir: string): boolean {
  mkdirSync(sessionsDir, { recursive: true })
  const target = join(sessionsDir, GITIGNORE_FILENAME)
  if (existsSync(target)) return false
  writeFileSync(target, SESSIONS_GITIGNORE_CONTENT, 'utf8')
  return true
}
