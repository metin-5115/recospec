import { useEffect, useCallback, useRef, useState } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'
import { suggestionsForSnapshot } from '@shared/assertion-suggestions'
import type { AssertionSuggestion, ElementRect, ElementSnapshot } from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'

export interface AssertionContext {
  suggestions: AssertionSuggestion[]
  locatorBundle: LocatorBundle | null
  elementSnapshot: ElementSnapshot
  pageMetadata: { url: string; title: string }
  screenshotDataUrl?: string
  /** Position of the picked element: present for a live pick, which can be captured and cropped. */
  elementRect?: ElementRect
  /** Set when the builder was opened from a stopped step row, not the live probe. */
  afterActionId?: string
}

/** The element probe and the assertion builder it opens. */
export function useAssertions() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const [isProbeActive, setIsProbeActive] = useState(false)
  const [assertionContext, setAssertionContext] = useState<AssertionContext | null>(null)
  const thumbnailRequested = useRef(false)

  useEffect(
    () =>
      onUIMessage((message) => {
        if (message.type === 'ASSERTION_THUMBNAIL') {
          setAssertionContext((ctx) => (ctx ? { ...ctx, screenshotDataUrl: message.dataUrl } : ctx))
          return
        }
        if (message.type !== 'ASSERTION_SUGGESTIONS') return
        setIsProbeActive(false)
        thumbnailRequested.current = false
        setAssertionContext({
          suggestions: message.suggestions,
          locatorBundle: message.locatorBundle,
          elementSnapshot: message.elementSnapshot,
          pageMetadata: message.pageMetadata,
          elementRect: message.elementRect,
        })
      }),
    [],
  )

  const toggleAssertionProbe = useCallback(async () => {
    if (!activeSession) return
    if (isProbeActive) {
      setIsProbeActive(false)
      await sendToBackground({ type: 'ASSERTION_PROBE_STOP', sessionId: activeSession.sessionId })
    } else {
      setIsProbeActive(true)
      await sendToBackground({ type: 'ASSERTION_PROBE_START', sessionId: activeSession.sessionId })
    }
  }, [activeSession, isProbeActive])

  /** The user picked the screenshot assertion: fetch the (cropped) preview, once per picked element. */
  const requestThumbnail = useCallback(() => {
    if (!activeSession || !assertionContext?.elementRect || thumbnailRequested.current) return
    thumbnailRequested.current = true
    void sendToBackground({
      type: 'ASSERTION_THUMBNAIL_REQUEST',
      sessionId: activeSession.sessionId,
      elementRect: assertionContext.elementRect,
    })
  }, [activeSession, assertionContext])

  const cancelAssertionBuilder = useCallback(() => {
    setAssertionContext(null)
  }, [])

  const addAssertion = useCallback(
    async (
      suggestion: AssertionSuggestion,
      locatorBundle: LocatorBundle | null,
      elementSnapshot: ElementSnapshot,
      pageMetadata: { url: string; title: string },
      customExpected?: string,
      afterActionId?: string,
    ) => {
      if (!activeSession) return
      setAssertionContext(null)
      await sendToBackground({
        type: 'ASSERTION_ADD',
        sessionId: activeSession.sessionId,
        suggestion,
        customExpected,
        locatorBundle,
        elementSnapshot,
        pageMetadata,
        afterActionId,
      })
    },
    [activeSession],
  )

  /**
   * Open the AssertionBuilder seeded from a stopped step. The element
   * snapshot + recorded locators live on the action itself, so we can build
   * suggestions without re-probing the live page.
   */
  const openAssertionForStep = useCallback(
    (actionId: string) => {
      if (!activeSession) return
      const step = useSessionStore.getState().steps.find((s) => s.actionId === actionId)
      if (!step?.target?.elementSnapshot) return
      const snapshot = step.target.elementSnapshot
      const value = (step.payload?.value as string | undefined) ?? undefined
      const suggestions = suggestionsForSnapshot(
        snapshot,
        step.pageTitle ?? '',
        value,
        step.pageUrl,
      )
      const bundle: LocatorBundle = {
        primary: step.target.primaryLocator,
        fallbacks: step.target.fallbackLocators,
        rejected: [],
        allCandidates: step.target.allCandidates ?? [
          step.target.primaryLocator,
          ...step.target.fallbackLocators,
        ],
      }
      setAssertionContext({
        suggestions,
        locatorBundle: bundle,
        elementSnapshot: snapshot,
        pageMetadata: { url: step.pageUrl, title: step.pageTitle ?? '' },
        afterActionId: actionId,
      })
    },
    [activeSession],
  )

  return {
    isProbeActive,
    assertionContext,
    toggleAssertionProbe,
    requestThumbnail,
    cancelAssertionBuilder,
    addAssertion,
    openAssertionForStep,
  }
}
