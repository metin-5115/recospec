import { create } from 'zustand'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'
import type { GeneratedCode } from '@shared/types/generated'

interface SessionStore {
  activeSession: Session | null
  steps: RecordedAction[]
  generatedCode: GeneratedCode | null
  codeGenError: string | null
  setActiveSession: (session: Session | null) => void
  appendStep: (step: RecordedAction) => void
  deleteStep: (actionId: string) => void
  clearSteps: () => void
  setGeneratedCode: (code: GeneratedCode | null) => void
  setCodeGenError: (error: string | null) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  activeSession: null,
  steps: [],
  generatedCode: null,
  codeGenError: null,
  setActiveSession: (session) => set({ activeSession: session }),
  appendStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  deleteStep: (actionId) =>
    set((state) => ({ steps: state.steps.filter((s) => s.actionId !== actionId) })),
  clearSteps: () => set({ steps: [] }),
  setGeneratedCode: (code) => set({ generatedCode: code }),
  setCodeGenError: (error) => set({ codeGenError: error }),
}))
