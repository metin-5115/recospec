import { useEffect, useCallback, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { trySendToBackground } from '@shared/messaging/send'
import { downloadZipExport } from '@codegen/export/zip-export'
import { generate } from '@codegen/index'
import { isEmptySelection } from '@shared/types/generated'
import { CODEGEN_MAX_ATTEMPTS, CODEGEN_RETRY_DELAY_MS } from '@shared/constants'
import type { TestDataConfig, TemplateParamMode } from '@codegen/ir/types'
import type { ComposedParamMode } from '@codegen/planner/template-modes'

/** Code generation: framework and output options, the generated code, and ZIP export. */
export function useCodegen() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const generatedCode = useSessionStore((s) => s.generatedCode)
  const codeGenError = useSessionStore((s) => s.codeGenError)
  const selectedFramework = useSessionStore((s) => s.selectedFramework)
  const autoWaitEnabled = useSessionStore((s) => s.autoWaitEnabled)
  const bddEnabled = useSessionStore((s) => s.bddEnabled)
  const includeMocks = useSessionStore((s) => s.includeMocks)
  const outputSelection = useSessionStore((s) => s.outputSelection)
  const {
    setGeneratedCode,
    setCodeGenError,
    setSelectedFramework,
    setAutoWaitEnabled,
    setBddEnabled,
    setIncludeMocks,
    setOutputSelection,
  } = useSessionStore(
    useShallow((s) => ({
      setGeneratedCode: s.setGeneratedCode,
      setCodeGenError: s.setCodeGenError,
      setSelectedFramework: s.setSelectedFramework,
      setAutoWaitEnabled: s.setAutoWaitEnabled,
      setBddEnabled: s.setBddEnabled,
      setIncludeMocks: s.setIncludeMocks,
      setOutputSelection: s.setOutputSelection,
    })),
  )

  const [methodRenames, setMethodRenames] = useState<Record<string, string>>({})
  const [testData, setTestData] = useState<TestDataConfig>({ params: [] })
  // Per-element render modes for dynamic-content locators, keyed by the
  // element's locator string (== IR `locatorValue`). Drive the inline
  // "Sabit ad ↔ Parametre" toggle on container/template steps.
  const [composedModes, setComposedModes] = useState<Record<string, ComposedParamMode>>({})
  const [templateModes, setTemplateModes] = useState<Record<string, TemplateParamMode>>({})

  const renameMethod = useCallback((key: string, value: string) => {
    setMethodRenames((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setComposedMode = useCallback((key: string, mode: ComposedParamMode) => {
    setComposedModes((prev) => ({ ...prev, [key]: mode }))
  }, [])

  const setTemplateMode = useCallback((key: string, mode: TemplateParamMode) => {
    setTemplateModes((prev) => ({ ...prev, [key]: mode }))
  }, [])

  useEffect(
    () =>
      onUIMessage((message) => {
        if (message.type === 'CODE_GENERATED') {
          setCodeGenError(null)
          setGeneratedCode(message.code)
        } else if (message.type === 'CODE_GENERATE_ERROR') {
          setCodeGenError(message.error)
        }
      }),
    [setGeneratedCode, setCodeGenError],
  )

  const generateCode = useCallback(async () => {
    if (!activeSession) return
    setCodeGenError(null)
    for (let attempt = 0; attempt < CODEGEN_MAX_ATTEMPTS; attempt++) {
      try {
        await trySendToBackground({
          type: 'CODE_GENERATE',
          sessionId: activeSession.sessionId,
          framework: selectedFramework,
          includeMocks,
          autoWaitEnabled,
          methodRenames,
          testData,
          bdd: bddEnabled,
          selection: outputSelection,
          composedModes,
          templateModes,
        })
        return
      } catch {
        if (attempt === CODEGEN_MAX_ATTEMPTS - 1) {
          setCodeGenError(
            `Failed to reach background worker after ${CODEGEN_MAX_ATTEMPTS} attempts.`,
          )
        } else {
          await new Promise<void>((resolve) => window.setTimeout(resolve, CODEGEN_RETRY_DELAY_MS))
        }
      }
    }
  }, [
    activeSession,
    selectedFramework,
    includeMocks,
    autoWaitEnabled,
    methodRenames,
    testData,
    bddEnabled,
    outputSelection,
    composedModes,
    templateModes,
    setCodeGenError,
  ])

  const exportZip = useCallback(
    async (sessionId: string) => {
      const session = useSessionStore.getState().sessions.find((s) => s.sessionId === sessionId)
      if (!session) return
      if (isEmptySelection(outputSelection)) {
        setCodeGenError('Select at least one output (page objects, test, or scaffold) to export.')
        return
      }
      try {
        const code = await generate(sessionId, selectedFramework, {
          includeMocks,
          methodRenames,
          autoWaitEnabled,
          testData,
          bdd: bddEnabled,
          selection: outputSelection,
          composedModes,
          templateModes,
        })
        await downloadZipExport(session, code)
      } catch (err) {
        setCodeGenError(err instanceof Error ? err.message : 'ZIP export failed')
      }
    },
    [
      selectedFramework,
      includeMocks,
      autoWaitEnabled,
      methodRenames,
      testData,
      bddEnabled,
      outputSelection,
      composedModes,
      templateModes,
      setCodeGenError,
    ],
  )

  return {
    generatedCode,
    codeGenError,
    selectedFramework,
    setSelectedFramework,
    autoWaitEnabled,
    setAutoWaitEnabled,
    bddEnabled,
    setBddEnabled,
    includeMocks,
    setIncludeMocks,
    outputSelection,
    setOutputSelection,
    methodRenames,
    renameMethod,
    testData,
    setTestData,
    composedModes,
    templateModes,
    setComposedMode,
    setTemplateMode,
    generateCode,
    exportZip,
  }
}
