import { create } from 'zustand'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import type { GeneratedCode, FrameworkId } from '@shared/types/generated'

interface SessionStore {
  activeSession: Session | null
  steps: RecordedAction[]
  generatedCode: GeneratedCode | null
  codeGenError: string | null
  sessions: Session[]
  selectedFramework: FrameworkId
  setActiveSession: (session: Session | null) => void
  appendStep: (step: RecordedAction) => void
  deleteStep: (actionId: string) => void
  clearSteps: () => void
  setGeneratedCode: (code: GeneratedCode | null) => void
  setCodeGenError: (error: string | null) => void
  setSessions: (sessions: Session[]) => void
  upsertSession: (session: Session) => void
  removeSession: (sessionId: string) => void
  setSelectedFramework: (framework: FrameworkId) => void
}

const FRAMEWORK_STORAGE_KEY = 'playforge.selectedFramework'

function loadInitialFramework(): FrameworkId {
  try {
    const stored = window.localStorage.getItem(FRAMEWORK_STORAGE_KEY)
    if (stored === 'cypress' || stored === 'playwright-ts' || stored === 'selenium-py')
      return stored
  } catch {
    /* localStorage unavailable in some test envs */
  }
  return 'playwright-ts'
}

export const useSessionStore = create<SessionStore>((set) => ({
  activeSession: null,
  steps: [],
  generatedCode: null,
  codeGenError: null,
  sessions: [],
  selectedFramework: loadInitialFramework(),
  setActiveSession: (session) => set({ activeSession: session }),
  appendStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  deleteStep: (actionId) =>
    set((state) => ({ steps: state.steps.filter((s) => s.actionId !== actionId) })),
  clearSteps: () => set({ steps: [] }),
  setGeneratedCode: (code) => set({ generatedCode: code }),
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
}))
