import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CapturedEvent } from '@shared/types/action'

interface SentMessage {
  type: string
  event?: CapturedEvent
  eventId?: string
  sessionId?: string
  fingerprint?: unknown
}

const sent: SentMessage[] = []

vi.mock('@shared/messaging/send', () => ({
  sendToBackground: vi.fn(async (msg: SentMessage) => {
    sent.push(msg)
  }),
}))
vi.mock('./spinner-detector', () => ({ observeForSpinner: vi.fn(async () => null) }))

import { startCapture, stopCapture } from './event-capture'

const flushIdle = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

beforeEach(() => {
  sent.length = 0
  document.body.innerHTML =
    '<main><h1>Shop</h1><button id="buy" data-testid="buy">Buy</button></main>'
  startCapture('sess-1')
})
afterEach(() => stopCapture())

describe('event-capture — fingerprint is computed off the click path', () => {
  it('sends the click without a fingerprint but with an id the fingerprint can refer to', () => {
    document.getElementById('buy')!.click()

    const captured = sent.find((m) => m.type === 'EVENT_CAPTURED')
    expect(captured?.event?.eventId).toEqual(expect.any(String))
    expect(captured?.event?.target?.locatorBundle?.primary).toBeDefined()
    expect(captured?.event?.target?.locatorBundle?.fingerprint).toBeUndefined()
  })

  it('follows up with the fingerprint for that event once the page is idle', async () => {
    document.getElementById('buy')!.click()
    const eventId = sent.find((m) => m.type === 'EVENT_CAPTURED')?.event?.eventId

    await flushIdle()

    const followUp = sent.find((m) => m.type === 'ACTION_FINGERPRINT')
    expect(followUp).toMatchObject({ sessionId: 'sess-1', eventId })
    expect(followUp?.fingerprint).toMatchObject({ tag: 'button' })
  })

  it('sends nothing for the fingerprint if the recording stopped in the meantime', async () => {
    document.getElementById('buy')!.click()
    stopCapture()
    await flushIdle()
    expect(sent.some((m) => m.type === 'ACTION_FINGERPRINT')).toBe(false)
  })
})
