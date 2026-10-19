import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendToBackground, trySendToBackground } from './send'
import type { UIToBackgroundMessage } from '@shared/types/messages'

const message: UIToBackgroundMessage = { type: 'SESSION_PAUSE', sessionId: 's1' }

let sendMessage: ReturnType<typeof vi.fn>

beforeEach(() => {
  sendMessage = vi.fn()
  ;(globalThis as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage } }
})

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome
})

describe('trySendToBackground', () => {
  it('forwards the message', async () => {
    sendMessage.mockResolvedValue(undefined)
    await trySendToBackground(message)
    expect(sendMessage).toHaveBeenCalledWith(message)
  })

  it('rejects when the background worker cannot be reached', async () => {
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'))
    await expect(trySendToBackground(message)).rejects.toThrow('Receiving end does not exist')
  })
})

describe('sendToBackground', () => {
  it('swallows delivery failures', async () => {
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'))
    await expect(sendToBackground(message)).resolves.toBeUndefined()
  })
})
