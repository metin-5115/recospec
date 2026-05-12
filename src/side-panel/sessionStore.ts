import { create } from 'zustand'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import type { GeneratedCode, FrameworkId } from '@shared/types/generated'
import type { ScoredLocator } from '@shared/types/locator'
import type { StepPatch } from '@shared/types/messages'

interface SessionStore {
  activeSession: Session | null
  steps: RecordedAction[]
  generatedCode: GeneratedCode | null
  codeGenError: string | null
  /** True after the user manually edited / reordered / overrode a locator since the last code generation. */
  stepsDirty: boolean
  sessions: Session[]
  selectedFramework: FrameworkId
  /** Strip auto-detected wait steps from the generated code when false. */
  autoWaitEnabled: boolean
  setActiveSession: (session: Session | null) => void
  appendStep: (step: RecordedAction) => void
  deleteStep: (actionId: string) => void
  reorderSteps: (fromIndex: number, toIndex: number) => string[]
  updateStep: (actionId: string, patch: StepPatch) => void
  setStepLocator: (actionId: string, candidate: ScoredLocator) => StepPatch | null
  syncSteps: (steps: RecordedAction[]) => void
  clearSteps: () => void
  markStepsClean: () => void
  setGeneratedCode: (code: GeneratedCode | null) => void
  setCodeGenError: (error: string | null) => void
  setSessions: (sessions: Session[]) => void
  upsertSession: (session: Session) => void
  removeSession: (sessionId: string) => void
  setSelectedFramework: (framework: FrameworkId) => void
  setAutoWaitEnabled: (enabled: boolean) => void
}

const FRAMEWORK_STORAGE_KEY = 'playforge.selectedFramework'
const AUTO_WAIT_STORAGE_KEY = 'playforge.autoWaitEnabled'

function loadInitialAutoWait(): boolean {
  try {
    const stored = window.localStorage.getItem(AUTO_WAIT_STORAGE_KEY)
    if (stored === 'false') return false
  } catch {
    /* localStorage unavailable in some test envs */
  }
  return true
}

function loadInitialFramework(): FrameworkId {
  try {
    const stored = window.localStorage.getItem(FRAMEWORK_STORAGE_KEY)
    if (
      stored === 'cypress' ||
      stored === 'playwright-ts' ||
      stored === 'selenium-py' ||
      stored === 'selenium-java'
    )
      return stored
  } catch {
    /* localStorage unavailable in some test envs */
  }
  return 'playwright-ts'
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice()
  const [removed] = next.splice(from, 1)
  next.splice(to, 0, removed)
  return next
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  activeSession: null,
  steps: [],
  generatedCode: null,
  codeGenError: null,
  stepsDirty: false,
  sessions: [],
  selectedFramework: loadInitialFramework(),
  autoWaitEnabled: loadInitialAutoWait(),
  setActiveSession: (session) => set({ activeSession: session }),
  appendStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  deleteStep: (actionId) =>
    set((state) => ({
      steps: state.steps.filter((s) => s.actionId !== actionId),
      stepsDirty: state.stepsDirty || state.steps.some((s) => s.actionId === actionId),
    })),
  reorderSteps: (fromIndex, toIndex) => {
    const current = get().steps
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= current.length ||
      toIndex >= current.length
    ) {
      return current.map((s) => s.actionId)
    }
    const reordered = arrayMove(current, fromIndex, toIndex).map((s, idx) => ({
      ...s,
      sequenceNumber: idx,
    }))
    set({ steps: reordered, stepsDirty: true })
    return reordered.map((s) => s.actionId)
  },
  updateStep: (actionId, patch) =>
    set((state) => {
      const idx = state.steps.findIndex((s) => s.actionId === actionId)
      if (idx === -1) return state
      const current = state.steps[idx]
      const next: RecordedAction = {
        ...current,
        ...patch,
        target: patch.target ?? current.target,
      }
      const steps = state.steps.slice()
      steps[idx] = next
      return { steps, stepsDirty: true }
    }),
  setStepLocator: (actionId, candidate) => {
    const state = get()
    const step = state.steps.find((s) => s.actionId === actionId)
    if (!step?.target) return null
    const previousPrimary = step.target.primaryLocator
    const sameStrategy =
      previousPrimary.strategy === candidate.strategy &&
      JSON.stringify(previousPrimary.selector) === JSON.stringify(candidate.selector)
    if (sameStrategy) return null
    const remaining = (
      step.target.allCandidates ?? [previousPrimary, ...step.target.fallbackLocators]
    ).filter(
      (c) =>
        !(
          c.strategy === candidate.strategy &&
          JSON.stringify(c.selector) === JSON.stringify(candidate.selector)
        ),
    )
    const newFallbacks = [previousPrimary, ...remaining.filter((c) => c !== previousPrimary)].slice(
      0,
      Math.max(step.target.fallbackLocators.length, 3),
    )
    const newTarget: NonNullable<RecordedAction['target']> = {
      ...step.target,
      primaryLocator: candidate,
      fallbackLocators: newFallbacks,
      userOverridden: true,
    }
    const patch: StepPatch = { target: newTarget }
    set((s) => {
      const idx = s.steps.findIndex((x) => x.actionId === actionId)
      if (idx === -1) return s
      const steps = s.steps.slice()
      steps[idx] = { ...s.steps[idx], target: newTarget }
      return { steps, stepsDirty: true }
    })
    return patch
  },
  syncSteps: (steps) => set({ steps }),
  clearSteps: () => set({ steps: [], stepsDirty: false }),
  markStepsClean: () => set({ stepsDirty: false }),
  setGeneratedCode: (code) =>
    set((state) => ({
      generatedCode: code,
      stepsDirty: code ? false : state.stepsDirty,
    })),
  setCodeGenError: (error) => set({ codeGenError: error }),
  setSessions: (sessions) => set({ sessions }),
  upsertSession: (session) =>
    set((state) => {
      const exists = state.sessions.some((s) => s.sessionId === session.sessionId)
      return {
        sessions: exists
          ? state.sessions.map((s) => (s.sessionId === session.sessionId ? session : s))
          : [session, ...state.sessions],
      }
    }),
  removeSession: (sessionId) =>
    set((state) => ({ sessions: state.sessions.filter((s) => s.sessionId !== sessionId) })),
  setSelectedFramework: (framework) => {
    try {
      window.localStorage.setItem(FRAMEWORK_STORAGE_KEY, framework)
    } catch {
      /* localStorage unavailable */
    }
    set({ selectedFramework: framework })
  },
  setAutoWaitEnabled: (enabled) => {
    try {
      window.localStorage.setItem(AUTO_WAIT_STORAGE_KEY, enabled ? 'true' : 'false')
    } catch {
      /* localStorage unavailable */
    }
    set({ autoWaitEnabled: enabled })
  },
}))
