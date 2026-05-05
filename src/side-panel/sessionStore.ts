import { create } from 'zustand'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'

interface SessionStore {
  activeSession: Session | null
  steps: RecordedAction[]
  setActiveSession: (session: Session | null) => void
  appendStep: (step: RecordedAction) => void
  clearSteps: () => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  activeSession: null,
  steps: [],
  setActiveSession: (session) => set({ activeSession: session }),
  appendStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  clearSteps: () => set({ steps: [] }),
}))
