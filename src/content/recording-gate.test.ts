import { describe, it, expect, vi } from 'vitest'
import { announceWhenRecording } from './recording-gate'

describe('announceWhenRecording', () => {
  it('stays silent while nothing is being recorded, so the service worker is not woken', async () => {
    const announce = vi.fn(async () => undefined)
    await announceWhenRecording(async () => false, announce)
    expect(announce).not.toHaveBeenCalled()
  })

  it('announces itself while a recording is active — including after a navigation', async () => {
    const announce = vi.fn(async () => undefined)
    await announceWhenRecording(async () => true, announce)
    expect(announce).toHaveBeenCalledTimes(1)
  })
})
