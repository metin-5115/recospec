import { useEffect, useCallback, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'
import { sendToBackground } from '@shared/messaging/send'
import { STEP_FLASH_DURATION_MS } from '@shared/constants'
import {
  ContentScriptMissingError,
  IndexedDBQuotaError,
  ServiceWorkerColdError,
  isPortDisconnectedError,
} from '@shared/errors'

/** Recording lifecycle: start / pause / resume / stop, plus the live step stream. */
export function useRecording() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const asyncError = useSessionStore((s) => s.asyncError)
  const pierceClosedShadow = useSessionStore((s) => s.pierceClosedShadow)
  const captureNetwork = useSessionStore((s) => s.captureNetwork)
  const {
    appendStep,
    appendSteps,
    attachFingerprint,
    syncSteps,
    setActiveSession,
    upsertSession,
    clearSteps,
    setGeneratedCode,
    setCodeGenError,
    setAsyncError,
  } = useSessionStore(
    useShallow((s) => ({
      appendStep: s.appendStep,
      appendSteps: s.appendSteps,
      attachFingerprint: s.attachFingerprint,
      syncSteps: s.syncSteps,
      setActiveSession: s.setActiveSession,
      upsertSession: s.upsertSession,
      clearSteps: s.clearSteps,
      setGeneratedCode: s.setGeneratedCode,
      setCodeGenError: s.setCodeGenError,
      setAsyncError: s.setAsyncError,
    })),
  )

  const [isStarting, setIsStarting] = useState(false)
  const [lastStepId, setLastStepId] = useState<string | null>(null)
  const flashTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const cleanup = onUIMessage((message) => {
      if (message.type === 'STEP_RECORDED') {
        appendStep(message.step)
        if (flashTimerRef.current !== null) {
          window.clearTimeout(flashTimerRef.current)
        }
        setLastStepId(message.step.actionId)
        flashTimerRef.current = window.setTimeout(() => {
          setLastStepId(null)
          flashTimerRef.current = null
        }, STEP_FLASH_DURATION_MS)
      } else if (message.type === 'STEP_FINGERPRINT') {
        attachFingerprint(message.actionId, message.fingerprint)
      } else if (message.type === 'NETWORK_STEPS_RECORDED') {
        appendSteps(message.steps)
      } else if (message.type === 'STEPS_SYNCED') {
        syncSteps(message.steps)
      } else if (message.type === 'SESSION_STATE_CHANGED') {
        setActiveSession(message.session)
        upsertSession(message.session)
      } else if (message.type === 'STORAGE_QUOTA_EXCEEDED') {
        setAsyncError(new IndexedDBQuotaError())
      }
    })
    return () => {
      cleanup()
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current)
        flashTimerRef.current = null
      }
    }
  }, [
    appendStep,
    appendSteps,
    attachFingerprint,
    syncSteps,
    setActiveSession,
    upsertSession,
    setAsyncError,
  ])

  const startRecording = useCallback(async () => {
    if (isStarting) return
    setIsStarting(true)
    try {
      let tab: chrome.tabs.Tab | undefined
      try {
        const win = await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] })
        tab = win.tabs?.find((t) => t.active)
      } catch {
        const [fallbackTab] = await chrome.tabs.query({ active: true, currentWindow: true })
        tab = fallbackTab
      }
      if (!tab?.id) {
        setCodeGenError('Could not find an active browser tab. Please click on the page first.')
        return
      }
      clearSteps()
      setGeneratedCode(null)
      setCodeGenError(null)

      // Strict send — chrome.runtime.sendMessage rejects with "Receiving end
      // does not exist" when the SW is dead. We surface that through the
      // typed boundary so the retry CTA can wake the worker via PING.
      try {
        await chrome.runtime.sendMessage({
          type: 'SESSION_START',
          tabId: tab.id,
          metadata: {
            userAgent: navigator.userAgent,
            viewport: { width: window.screen.width, height: window.screen.height },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          config: {
            captureClicks: true,
            captureInputs: true,
            captureNavigation: true,
            pierceClosedShadow,
            captureNetwork,
          },
        })
      } catch (err) {
        if (isPortDisconnectedError(err)) {
          setAsyncError(new ServiceWorkerColdError(err))
          return
        }
        throw err
      }

      // Probe the content script. `chrome.tabs.sendMessage` rejects with
      // "Receiving end does not exist" only when no listener exists in the
      // tab — i.e. the recorder content script never loaded (chrome:// page,
      // extension was just reloaded, etc.). Live tabs answer with undefined.
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'PROBE' })
      } catch (err) {
        if (isPortDisconnectedError(err)) {
          setAsyncError(new ContentScriptMissingError(tab.id, err))
        }
      }
    } finally {
      setIsStarting(false)
    }
  }, [
    isStarting,
    clearSteps,
    setGeneratedCode,
    setCodeGenError,
    setAsyncError,
    pierceClosedShadow,
    captureNetwork,
  ])

  const stopRecording = useCallback(async () => {
    if (!activeSession) return
    await sendToBackground({ type: 'SESSION_STOP', sessionId: activeSession.sessionId })
  }, [activeSession])

  const pauseRecording = useCallback(async () => {
    if (!activeSession) return
    await sendToBackground({ type: 'SESSION_PAUSE', sessionId: activeSession.sessionId })
  }, [activeSession])

  const resumeRecording = useCallback(async () => {
    if (!activeSession) return
    await sendToBackground({ type: 'SESSION_RESUME', sessionId: activeSession.sessionId })
  }, [activeSession])

  return {
    activeSession,
    isRecording: activeSession?.state === 'recording',
    isPaused: activeSession?.state === 'paused',
    isStarting,
    lastStepId,
    asyncError,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  }
}
