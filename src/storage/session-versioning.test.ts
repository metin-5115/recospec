import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  computeFlowSignature,
  createIteration,
  createSession,
  findIterationCandidate,
  findRootSessionId,
  getVersions,
  linkIteration,
} from './session-repo'
import { appendAction } from './action-repo'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'

function loc(strategy: ScoredLocator['strategy'], selector: string): ScoredLocator {
  return { strategy, selector, framework: {}, score: 80, matchCount: 1 }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: crypto.randomUUID(),
    name: 'Test Session',
    state: 'stopped',
    startUrl: 'https://example.com/login',
    startedAt: Date.now(),
    metadata: {
      userAgent: 'x',
      viewport: { width: 1280, height: 800 },
      timezone: 'UTC',
    },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'sig-default',
    ...overrides,
  }
}

function makeStep(
  sessionId: string,
  sequenceNumber: number,
  type: RecordedAction['type'],
  strategy: ScoredLocator['strategy'],
  selector: string,
): RecordedAction {
  return {
    actionId: crypto.randomUUID(),
    sessionId,
    sequenceNumber,
    type,
    timestamp: 0,
    pageUrl: 'https://example.com',
    target: {
      primaryLocator: loc(strategy, selector),
      fallbackLocators: [],
      elementSnapshot: { tagName: 'input', attributes: {}, textContent: '' },
    },
  }
}

beforeEach(async () => {
  await db.sessions.clear()
  await db.actions.clear()
})

describe('computeFlowSignature', () => {
  it('is deterministic for the same input', () => {
    const steps = [
      makeStep('s', 0, 'click', 'css', '#login'),
      makeStep('s', 1, 'fill', 'id', '#email'),
      makeStep('s', 2, 'click', 'css', '#submit'),
    ]
    const a = computeFlowSignature('https://app.test/login', steps)
    const b = computeFlowSignature('https://app.test/login', steps)
    expect(a).toBe(b)
  })

  it('discriminates flows on different URLs', () => {
    const steps = [makeStep('s', 0, 'click', 'css', '#login')]
    expect(computeFlowSignature('https://a.test/x', steps)).not.toBe(
      computeFlowSignature('https://b.test/x', steps),
    )
  })

  it('normalizes trailing slash + querystring + hash in the start URL', () => {
    const steps = [makeStep('s', 0, 'click', 'css', '#x')]
    expect(computeFlowSignature('https://app.test/login/', steps)).toBe(
      computeFlowSignature('https://app.test/login?ref=foo#bar', steps),
    )
  })

  it('discriminates flows whose first 3 steps differ in shape', () => {
    const a = [
      makeStep('s', 0, 'click', 'css', '#login'),
      makeStep('s', 1, 'fill', 'id', '#email'),
      makeStep('s', 2, 'click', 'css', '#submit'),
    ]
    const b = [
      makeStep('s', 0, 'click', 'css', '#login'),
      makeStep('s', 1, 'click', 'css', '#forgot'),
      makeStep('s', 2, 'click', 'css', '#submit'),
    ]
    expect(computeFlowSignature('https://app.test/login', a)).not.toBe(
      computeFlowSignature('https://app.test/login', b),
    )
  })

  it('handles partial step counts (less than 3) without throwing', () => {
    const out = computeFlowSignature('https://app.test/', [makeStep('s', 0, 'click', 'css', '#a')])
    expect(out).toMatch(/https:\/\/app\.test::click\|-\|-::/)
  })
})

describe('createIteration + getVersions', () => {
  it('createIteration links the new session to the parent and bumps iterationNumber', async () => {
    const parent = makeSession({ name: 'Login Flow', iterationNumber: 1 })
    await createSession(parent)
    const child = await createIteration(parent.sessionId, {
      startUrl: parent.startUrl,
      metadata: parent.metadata,
      config: parent.config,
    })
    expect(child.parentSessionId).toBe(parent.sessionId)
    expect(child.iterationNumber).toBe(2)
    expect(child.name).toBe('Login Flow v2')
    expect(child.flowSignature).toBe(parent.flowSignature)
  })

  it('createIteration strips an existing ` v<n>` suffix before re-suffixing', async () => {
    const parent = makeSession({ name: 'Login Flow v3', iterationNumber: 3 })
    await createSession(parent)
    const child = await createIteration(parent.sessionId, {
      startUrl: parent.startUrl,
      metadata: parent.metadata,
      config: parent.config,
    })
    expect(child.name).toBe('Login Flow v4')
  })

  it('findRootSessionId walks the parent chain to the root', async () => {
    const root = makeSession({ name: 'Login Flow' })
    await createSession(root)
    const v2 = await createIteration(root.sessionId, {
      startUrl: root.startUrl,
      metadata: root.metadata,
      config: root.config,
    })
    const v3 = await createIteration(v2.sessionId, {
      startUrl: root.startUrl,
      metadata: root.metadata,
      config: root.config,
    })
    expect(await findRootSessionId(v3.sessionId)).toBe(root.sessionId)
  })

  it('getVersions returns root + all descendants in DFS order with depths', async () => {
    const root = makeSession({ name: 'Login Flow' })
    await createSession(root)
    const v2 = await createIteration(root.sessionId, {
      startUrl: root.startUrl,
      metadata: root.metadata,
      config: root.config,
    })
    const v3 = await createIteration(v2.sessionId, {
      startUrl: root.startUrl,
      metadata: root.metadata,
      config: root.config,
    })
    const versions = await getVersions(v3.sessionId)
    expect(versions.map((v) => v.session.sessionId)).toEqual([
      root.sessionId,
      v2.sessionId,
      v3.sessionId,
    ])
    expect(versions.map((v) => v.depth)).toEqual([0, 1, 2])
  })
})

describe('findIterationCandidate', () => {
  it('returns the most recent stopped session with the matching signature', async () => {
    const older = makeSession({
      state: 'stopped',
      stoppedAt: 100,
      flowSignature: 'sig-target',
    })
    const newer = makeSession({
      state: 'stopped',
      stoppedAt: 200,
      flowSignature: 'sig-target',
    })
    const otherFlow = makeSession({ state: 'stopped', flowSignature: 'sig-other' })
    await createSession(older)
    await createSession(newer)
    await createSession(otherFlow)
    const found = await findIterationCandidate('sig-target')
    expect(found?.sessionId).toBe(newer.sessionId)
  })

  it('excludes the live session itself even when its signature matches', async () => {
    const live = makeSession({
      state: 'recording',
      flowSignature: 'sig-x',
    })
    const prior = makeSession({
      state: 'stopped',
      stoppedAt: 100,
      flowSignature: 'sig-x',
    })
    await createSession(live)
    await createSession(prior)
    const found = await findIterationCandidate('sig-x', live.sessionId)
    expect(found?.sessionId).toBe(prior.sessionId)
  })

  it('returns undefined when no stopped session matches', async () => {
    await createSession(makeSession({ state: 'recording', flowSignature: 'sig-x' }))
    expect(await findIterationCandidate('sig-x')).toBeUndefined()
  })
})

describe('linkIteration', () => {
  it('attaches an existing session to a parent and renames/renumbers it', async () => {
    const parent = makeSession({ name: 'Login Flow', iterationNumber: 1 })
    const live = makeSession({ name: 'Session 2026-…', state: 'recording' })
    await createSession(parent)
    await createSession(live)

    const linked = await linkIteration(live.sessionId, parent.sessionId)
    expect(linked?.parentSessionId).toBe(parent.sessionId)
    expect(linked?.iterationNumber).toBe(2)
    expect(linked?.name).toBe('Login Flow v2')
    expect(linked?.flowSignature).toBe(parent.flowSignature)
  })

  it('returns undefined when the parent does not exist', async () => {
    const live = makeSession({ state: 'recording' })
    await createSession(live)
    const linked = await linkIteration(live.sessionId, 'no-such-parent')
    expect(linked).toBeUndefined()
  })
})

// Compound smoke test that exercises the whole "second-recording" flow end-to-end
// against the DB so we know computeFlowSignature + findIterationCandidate + linkIteration
// agree on the same shape-hash.
describe('end-to-end iteration detection', () => {
  it('matches a re-recorded flow by signature and links it under the original', async () => {
    const url = 'https://app.test/login'
    const firstRunSteps = [
      makeStep('first', 0, 'click', 'css', '#user'),
      makeStep('first', 1, 'fill', 'id', '#email'),
      makeStep('first', 2, 'click', 'css', '#submit'),
    ]
    const sig = computeFlowSignature(url, firstRunSteps)

    const first = makeSession({
      state: 'stopped',
      stoppedAt: 100,
      startUrl: url,
      flowSignature: sig,
      name: 'Login Flow',
    })
    await createSession(first)
    for (const s of firstRunSteps) await appendAction(s)

    // Simulated second recording — same shape, fresh session, placeholder sig
    const second = makeSession({
      state: 'recording',
      startUrl: url,
      flowSignature: `pending::${url}`,
      name: 'Session draft',
    })
    await createSession(second)
    const secondSteps = [
      makeStep(second.sessionId, 0, 'click', 'css', '#user'),
      makeStep(second.sessionId, 1, 'fill', 'id', '#email'),
      makeStep(second.sessionId, 2, 'click', 'css', '#submit'),
    ]
    const candidate = await findIterationCandidate(
      computeFlowSignature(url, secondSteps),
      second.sessionId,
    )
    expect(candidate?.sessionId).toBe(first.sessionId)

    const linked = await linkIteration(second.sessionId, first.sessionId)
    expect(linked?.iterationNumber).toBe(2)
    expect(linked?.parentSessionId).toBe(first.sessionId)
  })
})
