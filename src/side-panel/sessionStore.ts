import { create } from 'zustand'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import type { GeneratedCode, FrameworkId, OutputSelection } from '@shared/types/generated'
import { DEFAULT_OUTPUT_SELECTION } from '@shared/types/generated'
import type { ElementFingerprint, ScoredLocator } from '@shared/types/locator'
import type { StepPatch } from '@shared/types/messages'
import type { RecospecError } from '@shared/errors'
import { PREF_KEYS } from '@shared/constants'
import { isBoolean, readPref, writePref } from './preferences'

export type SidePanelTab = 'recording' | 'history'

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
  /** Emit Gherkin .feature + step definitions alongside the page objects. */
  bddEnabled: boolean
  /**
   * Wrap captured network requests in framework mocks on export. Persisted as
   * a default so the user does not re-tick it every recording.
   */
  includeMocks: boolean
  /** Append a "flow ended on this URL" assertion to recordings with no assertion. Default on. */
  finalStateAssertion: boolean
  /** Wire fallback locators into Playwright / Cypress output at run time. Default on. */
  selfHealing: boolean
  /**
   * Opt-in: pierce CLOSED shadow roots during recording (invasive MAIN-world
   * `attachShadow` proxy). Persisted; default off.
   */
  pierceClosedShadow: boolean
  /** Record the page's fetch/XHR traffic during a session. Default on; takes effect on the next recording. */
  captureNetwork: boolean
  /**
   * Which file groups the ZIP export emits (page objects / test / scaffold).
   * Persisted so "I only want the page object" is a one-time choice.
   */
  outputSelection: OutputSelection
  /** Active side-panel tab. Lives in the store so the ErrorBoundary can route the user to History. */
  activeTab: SidePanelTab
  /**
   * Async error surfaced from runtime code paths that the React render-time
   * ErrorBoundary cannot catch on its own (rejected sendMessage, background
   * broadcasts, etc.). SidePanelApp re-throws this during render to let the
   * boundary pick the contextual branch.
   */
  asyncError: RecospecError | null
  setActiveSession: (session: Session | null) => void
  setActiveTab: (tab: SidePanelTab) => void
  setAsyncError: (error: RecospecError | null) => void
  appendStep: (step: RecordedAction) => void
  appendSteps: (steps: RecordedAction[]) => void
  /** Adds a fingerprint computed after the step was recorded; only that step changes. */
  attachFingerprint: (actionId: string, fingerprint: ElementFingerprint) => void
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
  setBddEnabled: (enabled: boolean) => void
  setIncludeMocks: (enabled: boolean) => void
  setFinalStateAssertion: (enabled: boolean) => void
  setSelfHealing: (enabled: boolean) => void
  setPierceClosedShadow: (enabled: boolean) => void
  setCaptureNetwork: (enabled: boolean) => void
  setOutputSelection: (selection: OutputSelection) => void
}

const FRAMEWORKS: readonly FrameworkId[] = [
  'playwright-ts',
  'cypress',
  'selenium-py',
  'selenium-java',
]

const isFrameworkId = (value: unknown): value is FrameworkId =>
  typeof value === 'string' && (FRAMEWORKS as readonly string[]).includes(value)

const isOutputSelection = (value: unknown): value is OutputSelection =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as OutputSelection).pageObjects === 'boolean' &&
  typeof (value as OutputSelection).test === 'boolean' &&
  typeof (value as OutputSelection).scaffold === 'boolean'

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
  selectedFramework: readPref(PREF_KEYS.selectedFramework, isFrameworkId, 'playwright-ts'),
  autoWaitEnabled: readPref(PREF_KEYS.autoWaitEnabled, isBoolean, true),
  bddEnabled: readPref(PREF_KEYS.bddEnabled, isBoolean, false),
  includeMocks: readPref(PREF_KEYS.includeMocks, isBoolean, false),
  finalStateAssertion: readPref(PREF_KEYS.finalStateAssertion, isBoolean, true),
  selfHealing: readPref(PREF_KEYS.selfHealing, isBoolean, true),
  pierceClosedShadow: readPref(PREF_KEYS.pierceClosedShadow, isBoolean, false),
  captureNetwork: readPref(PREF_KEYS.captureNetwork, isBoolean, true),
  outputSelection: readPref(PREF_KEYS.outputSelection, isOutputSelection, {
    ...DEFAULT_OUTPUT_SELECTION,
  }),
  activeTab: 'recording',
  asyncError: null,
  setActiveSession: (session) => set({ activeSession: session }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setAsyncError: (error) => set({ asyncError: error }),
  appendStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  appendSteps: (steps) => set((state) => ({ steps: [...state.steps, ...steps] })),
  attachFingerprint: (actionId, fingerprint) =>
    set((state) => ({
      steps: state.steps.map((s) =>
        s.actionId === actionId && s.target ? { ...s, target: { ...s.target, fingerprint } } : s,
      ),
    })),
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
    writePref(PREF_KEYS.selectedFramework, framework)
    set({ selectedFramework: framework })
  },
  setAutoWaitEnabled: (enabled) => {
    writePref(PREF_KEYS.autoWaitEnabled, enabled)
    set({ autoWaitEnabled: enabled })
  },
  setBddEnabled: (enabled) => {
    writePref(PREF_KEYS.bddEnabled, enabled)
    set({ bddEnabled: enabled })
  },
  setIncludeMocks: (enabled) => {
    writePref(PREF_KEYS.includeMocks, enabled)
    set({ includeMocks: enabled })
  },
  setSelfHealing: (enabled) => {
    writePref(PREF_KEYS.selfHealing, enabled)
    set({ selfHealing: enabled })
  },
  setFinalStateAssertion: (enabled) => {
    writePref(PREF_KEYS.finalStateAssertion, enabled)
    set({ finalStateAssertion: enabled })
  },
  setCaptureNetwork: (enabled) => {
    writePref(PREF_KEYS.captureNetwork, enabled)
    set({ captureNetwork: enabled })
  },
  setPierceClosedShadow: (enabled) => {
    writePref(PREF_KEYS.pierceClosedShadow, enabled)
    set({ pierceClosedShadow: enabled })
  },
  setOutputSelection: (selection) => {
    writePref(PREF_KEYS.outputSelection, selection)
    set({ outputSelection: selection })
  },
}))
