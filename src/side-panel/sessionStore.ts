import { create } from 'zustand'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import type { GeneratedCode } from '@shared/types/generated'

interface SessionStore {
  activeSession: Session | null
  steps: RecordedAction[]
  generatedCode: GeneratedCode | null
  setActiveSession: (session: Session | null) => void
  appendStep: (step: RecordedAction) => void
  clearSteps: () => void
  setGeneratedCode: (code: GeneratedCode | null) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  activeSession: null,
  steps: [],
  generatedCode: null,
  setActiveSession: (session) => set({ activeSession: session }),
  appendStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  clearSteps: () => set({ steps: [] }),
  setGeneratedCode: (code) => set({ generatedCode: code }),
}))
