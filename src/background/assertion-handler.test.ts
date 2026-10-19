import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@storage/db'
import { appendAction, getActionsBySession } from '@storage/action-repo'
import { handleAssertionAdd } from './assertion-handler'
import type { RecordedAction, AssertionSuggestion, ElementSnapshot } from '@shared/types/action'

function makeStep(
  sessionId: string,
  sequenceNumber: number,
  type: RecordedAction['type'] = 'click',
): RecordedAction {
  return {
    actionId: crypto.randomUUID(),
    sessionId,
    sequenceNumber,
    type,
    timestamp: Date.now() + sequenceNumber,
    pageUrl: 'https://example.com',
  }
}

const snap: ElementSnapshot = { tagName: 'button', attributes: {}, textContent: 'Submit' }
const suggestion: AssertionSuggestion = {
  type: 'visible',
  label: 'Expect visible',
}

const broadcastSpy = vi.fn().mockResolvedValue(undefined)

beforeEach(async () => {
  await db.actions.clear()
  await db.sessions.clear()
  broadcastSpy.mockClear()
  // Stub chrome.runtime.sendMessage so broadcastToUI is a no-op.
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: broadcastSpy },
    tabs: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleAssertionAdd — insert after step', () => {
  it('appends to the end when afterActionId is omitted', async () => {
    const sessionId = 's-append'
    const a1 = makeStep(sessionId, 0)
    const a2 = makeStep(sessionId, 1)
    await appendAction(a1)
    await appendAction(a2)

    await handleAssertionAdd(sessionId, suggestion, undefined, null, snap, {
      url: 'https://example.com',
      title: 'Demo',
    })

    const after = await getActionsBySession(sessionId)
    expect(after).toHaveLength(3)
    expect(after[2].type).toBe('assert')
    expect(after.map((a) => a.sequenceNumber)).toEqual([0, 1, 2])
  })

  it('inserts the assertion at index+1 of afterActionId and renumbers later steps', async () => {
    const sessionId = 's-insert'
    const a1 = makeStep(sessionId, 0, 'click')
    const a2 = makeStep(sessionId, 1, 'fill')
    const a3 = makeStep(sessionId, 2, 'click')
    await appendAction(a1)
    await appendAction(a2)
    await appendAction(a3)

    await handleAssertionAdd(
      sessionId,
      suggestion,
      undefined,
      null,
      snap,
      { url: 'https://example.com', title: 'Demo' },
      a1.actionId,
    )

    const after = await getActionsBySession(sessionId)
    expect(after).toHaveLength(4)
    expect(after.map((a) => a.sequenceNumber)).toEqual([0, 1, 2, 3])
    // Original order: a1, a2, a3 → after insert: a1, ASSERT, a2, a3
    expect(after[0].actionId).toBe(a1.actionId)
    expect(after[1].type).toBe('assert')
    expect(after[2].actionId).toBe(a2.actionId)
    expect(after[3].actionId).toBe(a3.actionId)
  })

  it('appends instead of failing when afterActionId is unknown', async () => {
    const sessionId = 's-unknown'
    const a1 = makeStep(sessionId, 0)
    await appendAction(a1)

    await handleAssertionAdd(
      sessionId,
      suggestion,
      undefined,
      null,
      snap,
      { url: 'https://example.com', title: 'Demo' },
      'no-such-id',
    )

    const after = await getActionsBySession(sessionId)
    expect(after).toHaveLength(2)
    expect(after[1].type).toBe('assert')
    expect(after[1].sequenceNumber).toBe(1)
  })

  it('broadcasts STEPS_SYNCED when an insert happens, STEP_RECORDED when appending', async () => {
    const sessionId = 's-broadcast'
    const a1 = makeStep(sessionId, 0)
    const a2 = makeStep(sessionId, 1)
    await appendAction(a1)
    await appendAction(a2)

    // Inserting in the middle → STEPS_SYNCED.
    broadcastSpy.mockClear()
    await handleAssertionAdd(
      sessionId,
      suggestion,
      undefined,
      null,
      snap,
      { url: 'https://example.com', title: 'Demo' },
      a1.actionId,
    )
    const messageTypes = broadcastSpy.mock.calls.map((call) => (call[0] as { type: string }).type)
    expect(messageTypes).toContain('STEPS_SYNCED')

    // Appending at the end → STEP_RECORDED.
    broadcastSpy.mockClear()
    await handleAssertionAdd(sessionId, suggestion, undefined, null, snap, {
      url: 'https://example.com',
      title: 'Demo',
    })
    const types2 = broadcastSpy.mock.calls.map((call) => (call[0] as { type: string }).type)
    expect(types2).toContain('STEP_RECORDED')
  })
})

describe('handleAssertionAdd — url assertion', () => {
  it('stores the expected route and no element target', async () => {
    const sessionId = 's-url'
    await appendAction(makeStep(sessionId, 0))

    await handleAssertionAdd(
      sessionId,
      { type: 'url', label: 'Expect URL contains: /cart', expected: '/cart' },
      undefined,
      {
        primary: {
          strategy: 'testid',
          selector: '[data-testid="x"]',
          framework: {},
          score: 90,
          matchCount: 1,
        },
        fallbacks: [],
        rejected: [],
        allCandidates: [],
      },
      snap,
      { url: 'https://example.com/cart', title: 'Cart' },
    )

    const [, added] = await getActionsBySession(sessionId)
    expect(added?.payload).toMatchObject({ assertionType: 'url', expected: '/cart' })
    expect(added?.target).toBeUndefined()
  })
})
