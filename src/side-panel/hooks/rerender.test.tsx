import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useSessionStore } from '../sessionStore'
import { useSession } from './useSession'
import { useRecording } from './useRecording'
import { useCodegen } from './useCodegen'
import { useReplay } from './useReplay'
import { useValidation } from './useValidation'
import { makeStep, resetUiHarness } from './ui-message-harness.test-util'

vi.mock('@storage/session-repo', () => ({ listSessions: vi.fn(async () => []) }))
vi.mock('@storage/action-repo', () => ({ getActionsBySession: vi.fn(async () => []) }))

beforeEach(resetUiHarness)
afterEach(cleanup)

/** Mount `useHook`, apply `change`, and report how many times the hook ran before and after. */
function rendersAround<T>(useHook: () => T, change: () => void): { before: number; after: number } {
  let renders = 0
  renderHook(() => {
    renders += 1
    return useHook()
  })
  const before = renders
  act(change)
  return { before, after: renders }
}

const appendStep = (): void => useSessionStore.getState().appendStep(makeStep('a1'))
const flipPreference = (): void => useSessionStore.getState().setPierceClosedShadow(true)

describe('useSession', () => {
  it('does not re-render when an unrelated store field changes', () => {
    const { before, after } = rendersAround(useSession, () =>
      useSessionStore.getState().setActiveTab('history'),
    )
    expect(after).toBe(before)
  })

  it('re-renders when a recorded step is appended', () => {
    const { before, after } = rendersAround(useSession, appendStep)
    expect(after).toBeGreaterThan(before)
  })
})

describe('per-concern hooks only re-render for the state they read', () => {
  it('useReplay ignores recorded steps and unrelated preferences', () => {
    const { before, after } = rendersAround(useReplay, () => {
      appendStep()
      flipPreference()
    })
    expect(after).toBe(before)
  })

  it('useValidation ignores recorded steps and unrelated preferences', () => {
    const { before, after } = rendersAround(useValidation, () => {
      appendStep()
      flipPreference()
    })
    expect(after).toBe(before)
  })

  it('useCodegen ignores recorded steps and unrelated preferences', () => {
    const { before, after } = rendersAround(useCodegen, () => {
      appendStep()
      flipPreference()
    })
    expect(after).toBe(before)
  })

  it('useCodegen re-renders when an option it exposes changes', () => {
    const { before, after } = rendersAround(useCodegen, () =>
      useSessionStore.getState().setIncludeMocks(true),
    )
    expect(after).toBeGreaterThan(before)
  })

  it('useRecording ignores recorded steps and output options', () => {
    const { before, after } = rendersAround(useRecording, () => {
      appendStep()
      useSessionStore.getState().setIncludeMocks(true)
    })
    expect(after).toBe(before)
  })
})
