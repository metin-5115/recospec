import { db } from './db'
import { deleteActionsBySession, getActionsBySession } from './action-repo'
import type { Session, SessionState, SessionMeta, CaptureConfig } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import {
  GC_ARCHIVED_DAYS,
  ITERATION_SIGNATURE_STEPS,
  STORAGE_QUOTA_WARN_RATIO,
} from '@shared/constants'
import { IndexedDBQuotaError, isQuotaExceededError } from '@shared/errors'

async function withQuotaGuard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (err) {
    if (isQuotaExceededError(err)) throw new IndexedDBQuotaError(err)
    throw err
  }
}

export async function createSession(session: Session): Promise<void> {
  await withQuotaGuard(() => db.sessions.add(session))
}

/**
 * Normalize a URL for signature comparison: keep origin + pathname, drop
 * trailing slash, querystring, and fragment. Falls back to the raw string
 * for non-http(s) URLs (e.g. `file://`, `about:blank`).
 */
function normalizeUrlForSignature(raw: string): string {
  try {
    const u = new URL(raw)
    const pathname = u.pathname.replace(/\/+$/, '')
    return `${u.origin}${pathname}`
  } catch {
    return raw.trim().replace(/\/+$/, '')
  }
}

/**
 * Tiny deterministic hash (djb2 xor variant). Output is unsigned 32-bit hex.
 * Cryptographic strength is not required — only collision-resistance for the
 * short signature surface we feed it.
 */
function djb2(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Deterministic shape-hash of a recording. Format:
 *
 *     <normalizedUrl>::<type1|type2|type3>::<strategy1|strategy2>::<hash>
 *
 * `steps` may be shorter than {@link ITERATION_SIGNATURE_STEPS} — missing
 * positions are encoded as `-` so an early-stopped recording still produces
 * a usable signature. The trailing hash absorbs the selector bodies so
 * two flows that share types/strategies but target different elements
 * still get distinct signatures.
 */
export function computeFlowSignature(startUrl: string, steps: RecordedAction[]): string {
  const url = normalizeUrlForSignature(startUrl)
  const slice = steps.slice(0, ITERATION_SIGNATURE_STEPS)
  const types: string[] = []
  const strategies: string[] = []
  const selectors: string[] = []
  for (let i = 0; i < ITERATION_SIGNATURE_STEPS; i++) {
    const step = slice[i]
    types.push(step?.type ?? '-')
    if (i < 2) {
      strategies.push(step?.target?.primaryLocator.strategy ?? '-')
      const sel = step?.target?.primaryLocator.selector
      selectors.push(typeof sel === 'string' ? sel : sel ? JSON.stringify(sel) : '-')
    }
  }
  const hash = djb2(`${url}|${types.join(',')}|${selectors.join(',')}`)
  return `${url}::${types.join('|')}::${strategies.join('|')}::${hash}`
}

/**
 * Walk up from `sessionId` to find the root of its version tree. Returns
 * the sessionId itself when it has no `parentSessionId`. Bounded to 64 hops
 * to defend against accidental cycles in the DB.
 */
export async function findRootSessionId(sessionId: string): Promise<string> {
  let current: Session | undefined = await db.sessions.get(sessionId)
  if (!current) return sessionId
  for (let i = 0; i < 64; i++) {
    if (!current.parentSessionId) break
    const next: Session | undefined = await db.sessions.get(current.parentSessionId)
    if (!next) break
    current = next
  }
  return current.sessionId
}

export interface VersionedSession {
  session: Session
  /** 0 for the root, 1 for its direct children, … */
  depth: number
}

/**
 * Returns the full version tree rooted at the same logical flow as
 * `sessionId`, flattened in DFS order with depth annotations so the UI can
 * render a simple indented list. Includes the input session itself.
 */
export async function getVersions(sessionId: string): Promise<VersionedSession[]> {
  const rootId = await findRootSessionId(sessionId)
  const all = await db.sessions.toArray()
  const byParent = new Map<string | undefined, Session[]>()
  for (const s of all) {
    const key = s.parentSessionId ?? undefined
    const list = byParent.get(key) ?? []
    list.push(s)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.iterationNumber - b.iterationNumber || a.startedAt - b.startedAt)
  }
  const root = all.find((s) => s.sessionId === rootId)
  if (!root) return []
  const out: VersionedSession[] = []
  const walk = (node: Session, depth: number): void => {
    out.push({ session: node, depth })
    const children = byParent.get(node.sessionId) ?? []
    for (const child of children) walk(child, depth + 1)
  }
  walk(root, 0)
  return out
}

/** Strip the trailing ` v<n>` suffix so we can re-derive the family name. */
function familyName(name: string): string {
  return name.replace(/\s+v\d+$/i, '').trim() || name
}

/**
 * Insert a new session as a child of `parentId`. Inherits the parent's
 * `flowSignature` so version-tree queries find it, increments
 * `iterationNumber`, and derives a name of the form `<family> v<n>`.
 */
export async function createIteration(
  parentId: string,
  options: {
    sessionId?: string
    tabId?: number
    startUrl: string
    metadata: SessionMeta
    config: CaptureConfig
  },
): Promise<Session> {
  const parent = await db.sessions.get(parentId)
  if (!parent) {
    throw new Error(`createIteration: parent session ${parentId} not found`)
  }
  const iterationNumber = parent.iterationNumber + 1
  const session: Session = {
    sessionId: options.sessionId ?? crypto.randomUUID(),
    name: `${familyName(parent.name)} v${iterationNumber}`,
    state: 'recording',
    startUrl: options.startUrl,
    startedAt: Date.now(),
    tabId: options.tabId,
    metadata: options.metadata,
    config: options.config,
    iterationNumber,
    parentSessionId: parent.sessionId,
    flowSignature: parent.flowSignature,
  }
  await withQuotaGuard(() => db.sessions.add(session))
  return session
}

/**
 * Look for previously-stopped sessions that share `flowSignature` — i.e.
 * candidate parents for a new iteration of the same logical flow. Excludes
 * `excludeSessionId` (the currently-recording session) and anything still
 * in the `recording` / `paused` state. Returns the most recent match first.
 */
export async function findIterationCandidate(
  flowSignature: string,
  excludeSessionId?: string,
): Promise<Session | undefined> {
  const matches = await db.sessions.where('flowSignature').equals(flowSignature).toArray()
  const eligible = matches
    .filter((s) => s.sessionId !== excludeSessionId)
    .filter((s) => s.state === 'stopped' || s.state === 'archived')
    .sort((a, b) => (b.stoppedAt ?? b.startedAt) - (a.stoppedAt ?? a.startedAt))
  return eligible[0]
}

/**
 * Attach the currently-recording session to a previously-recorded parent.
 * Updates `parentSessionId`, `iterationNumber`, `name`, and `flowSignature`
 * in a single write so listSessions broadcasts a single row update.
 */
export async function linkIteration(
  sessionId: string,
  parentId: string,
): Promise<Session | undefined> {
  const parent = await db.sessions.get(parentId)
  if (!parent) return undefined
  const iterationNumber = parent.iterationNumber + 1
  const patch: Partial<Session> = {
    parentSessionId: parent.sessionId,
    iterationNumber,
    flowSignature: parent.flowSignature,
    name: `${familyName(parent.name)} v${iterationNumber}`,
  }
  await withQuotaGuard(() => db.sessions.update(sessionId, patch))
  return db.sessions.get(sessionId)
}

/** Convenience: return a session along with its recorded actions, in order. */
export async function getSessionWithActions(
  sessionId: string,
): Promise<{ session: Session; actions: RecordedAction[] } | undefined> {
  const session = await db.sessions.get(sessionId)
  if (!session) return undefined
  const actions = await getActionsBySession(sessionId)
  return { session, actions }
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  return db.sessions.get(sessionId)
}

export async function updateSession(
  sessionId: string,
  patch: Partial<
    Pick<
      Session,
      'state' | 'stoppedAt' | 'name' | 'flowSignature' | 'iterationNumber' | 'parentSessionId'
    >
  >,
): Promise<void> {
  await withQuotaGuard(() => db.sessions.update(sessionId, patch))
}

export async function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy('startedAt').reverse().toArray()
}

export async function listSessionsByState(state: SessionState): Promise<Session[]> {
  return db.sessions.where('state').equals(state).toArray()
}

export async function archiveSession(sessionId: string): Promise<void> {
  await db.sessions.update(sessionId, { state: 'archived' })
}

export async function deleteSession(sessionId: string): Promise<void> {
  await deleteActionsBySession(sessionId)
  await db.sessions.delete(sessionId)
}

/** Delete archived sessions older than GC_ARCHIVED_DAYS. Returns count deleted. */
export async function garbageCollectArchivedSessions(): Promise<number> {
  const cutoff = Date.now() - GC_ARCHIVED_DAYS * 24 * 60 * 60 * 1000
  const old = await db.sessions
    .where('state')
    .equals('archived')
    .filter((s) => (s.stoppedAt ?? s.startedAt) < cutoff)
    .toArray()

  for (const s of old) {
    await deleteActionsBySession(s.sessionId)
    await db.sessions.delete(s.sessionId)
  }
  return old.length
}

export interface StorageQuotaInfo {
  usedBytes: number
  quotaBytes: number
  ratio: number
  warn: boolean
}

/** Returns storage usage info. warn=true when usage exceeds STORAGE_QUOTA_WARN_RATIO. */
export async function checkStorageQuota(): Promise<StorageQuotaInfo> {
  const estimate = await navigator.storage.estimate()
  const usedBytes = estimate.usage ?? 0
  const quotaBytes = estimate.quota ?? Number.MAX_SAFE_INTEGER
  const ratio = quotaBytes > 0 ? usedBytes / quotaBytes : 0
  return { usedBytes, quotaBytes, ratio, warn: ratio >= STORAGE_QUOTA_WARN_RATIO }
}
