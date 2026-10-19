import { useEffect, useCallback, useMemo, useState } from 'react'
import { useSessionStore } from '../sessionStore'
import { useSetStepLocator } from './useStepEditing'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'
import { LOCATOR_VALIDATION_MAX_TARGETS } from '@shared/constants'
import type { RecordedAction } from '@shared/types/action'
import type { LocatorValidationResult, LocatorValidationTarget } from '@shared/types/messages'

function buildValidationTargets(allSteps: RecordedAction[]): LocatorValidationTarget[] {
  const targets: LocatorValidationTarget[] = []
  allSteps.forEach((step, index) => {
    if (!step.target) return
    const label =
      step.annotation ||
      step.target.elementSnapshot.textContent?.trim() ||
      step.target.elementSnapshot.tagName ||
      step.type
    targets.push({
      actionId: step.actionId,
      index,
      label: label.slice(0, 60),
      primary: step.target.primaryLocator,
      fallbacks: step.target.fallbackLocators,
      shadowContext: step.target.shadowContext,
      frameContext: step.target.frameContext,
    })
  })
  return targets
}

/** Live "Test on Page" locator validation and acting on its results. */
export function useValidation() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const setStepLocator = useSetStepLocator()
  const [validationResults, setValidationResults] = useState<LocatorValidationResult[]>([])
  const [validationDurationMs, setValidationDurationMs] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validationTruncated, setValidationTruncated] = useState<number | undefined>(undefined)
  const [isValidating, setIsValidating] = useState(false)

  useEffect(
    () =>
      onUIMessage((message) => {
        if (message.type !== 'LOCATOR_VALIDATION_RESULT') return
        setIsValidating(false)
        setValidationResults(message.results)
        setValidationDurationMs(message.durationMs)
        setValidationError(message.error ?? null)
        setValidationTruncated(message.truncated)
      }),
    [],
  )

  const validateLocators = useCallback(async () => {
    if (!activeSession) return
    const targets = buildValidationTargets(useSessionStore.getState().steps)
    if (targets.length === 0) {
      setValidationResults([])
      setValidationError('No steps with captured locators to validate.')
      return
    }
    setIsValidating(true)
    setValidationError(null)
    setValidationTruncated(
      targets.length > LOCATOR_VALIDATION_MAX_TARGETS ? targets.length : undefined,
    )
    await sendToBackground({
      type: 'VALIDATE_LOCATORS',
      sessionId: activeSession.sessionId,
      recordedUrl: activeSession.startUrl,
      targets,
    })
  }, [activeSession])

  const showLocatorOnPage = useCallback(
    async (result: LocatorValidationResult) => {
      if (!activeSession) return
      const step = useSessionStore.getState().steps.find((s) => s.actionId === result.actionId)
      if (!step?.target) return
      await sendToBackground({
        type: 'HIGHLIGHT_LOCATOR',
        sessionId: activeSession.sessionId,
        locator: step.target.primaryLocator,
        shadowContext: step.target.shadowContext,
        frameContext: step.target.frameContext,
        label: result.label,
      })
    },
    [activeSession],
  )

  const applyFallbackLocator = useCallback(
    async (result: LocatorValidationResult, fallbackIndex: number) => {
      const step = useSessionStore.getState().steps.find((s) => s.actionId === result.actionId)
      if (!step?.target) return
      const fallback = step.target.fallbackLocators[fallbackIndex]
      if (!fallback) return
      await setStepLocator(result.actionId, fallback)
    },
    [setStepLocator],
  )

  const validationStats = useMemo(() => {
    const matched = validationResults.filter((r) => r.primary.status === 'matched').length
    return { matched, total: validationResults.length }
  }, [validationResults])

  return {
    validationResults,
    validationDurationMs,
    validationError,
    validationTruncated,
    validationStats,
    isValidating,
    validateLocators,
    showLocatorOnPage,
    useFallbackLocator: applyFallbackLocator,
  }
}
