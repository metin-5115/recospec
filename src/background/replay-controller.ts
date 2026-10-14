import { broadcastToUI, sendToTab } from '@shared/messaging/send'
import { getActionsBySession } from '@storage/action-repo'
import { getSession } from '@storage/session-repo'
import { logger } from '@shared/logger'
import {
  REPLAY_KEEPALIVE_ALARM_NAME,
  REPLAY_NAVIGATION_SETTLE_TIMEOUT_MS,
  REPLAY_STEP_PACING_MS,
  REPLAY_STEP_RESPONSE_TIMEOUT_MS,
} from '@shared/constants'
import { resolveActiveTab } from './active-tab'

type StepWaiter = (status: 'pass' | 'fail' | 'skipped', error?: string) => void

interface ActiveReplay {
  sessionId: string
  tabId: number
  aborted: boolean
  /** Resolver for the currently in-flight step. Each step registers and clears its own. */
  pendingResolve: StepWaiter | null
  pendingActionId: string | null
}

/**
 * Intentionally in-memory (documented exception to the "SW state lives in
 * IndexedDB" rule): it holds a live promise resolver and the target tab for the
 * run in flight, neither of which can be serialised. The keepalive alarm keeps
 * the worker alive for the run, and everything durable (session, actions) is
 * read from IndexedDB.
 */
let active: ActiveReplay | null = null

/**
 * Periodic alarm keeps the MV3 service worker awake during long replays.
 * Listener body is intentionally empty — the alarm firing alone resets the
 * idle timer. Set when a replay starts and cleared when it ends.
 */
function startKeepalive(): void {
  // chrome.alarms.create is fire-and-forget; clearing first guarantees a
  // fresh schedule on rapid replay restarts.
  chrome.alarms.clear(REPLAY_KEEPALIVE_ALARM_NAME).catch(() => undefined)
  chrome.alarms.create(REPLAY_KEEPALIVE_ALARM_NAME, { periodInMinutes: 0.4 }).catch?.((err) => {
    logger.warn('[BG] keepalive alarm create failed', err)
  })
  // Guard against double-registration; the listener is idempotent for our
  // purposes but the SDK warns if you add the same fn twice.
  if (!chrome.alarms.onAlarm.hasListener(onKeepaliveAlarm)) {
    chrome.alarms.onAlarm.addListener(onKeepaliveAlarm)
  }
}

function onKeepaliveAlarm(alarm: chrome.alarms.Alarm): void {
  if (alarm.name === REPLAY_KEEPALIVE_ALARM_NAME) {
    // No-op. Touching the listener prevents the SW from going idle.
  }
}

function stopKeepalive(): void {
  chrome.alarms.clear(REPLAY_KEEPALIVE_ALARM_NAME).catch(() => undefined)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Resolve when the supplied tab fires `complete` from `chrome.tabs.onUpdated`,
 * or when the deadline elapses. Used after `navigate` steps so subsequent
 * step locators bind against the new page rather than the old one.
 */
function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const cleanup = (): void => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      clearTimeout(timer)
    }
    const onUpdated = (changedTabId: number, changeInfo: { status?: string }): void => {
      if (changedTabId !== tabId) return
      if (changeInfo.status !== 'complete') return
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }, timeoutMs)
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

/**
 * Forward the next step to the content script and resolve when the script
 * answers with `REPLAY_STEP_RESPONSE`. Times out if the page never responds —
 * the response would otherwise be lost forever and the replay would stall.
 */
function awaitStepResponse(
  actionId: string,
): Promise<{ status: 'pass' | 'fail' | 'skipped'; error?: string }> {
  return new Promise((resolve) => {
    if (!active) {
      resolve({ status: 'fail', error: 'No active replay' })
      return
    }
    active.pendingActionId = actionId
    const timer = setTimeout(() => {
      if (active && active.pendingActionId === actionId) {
        active.pendingActionId = null
        active.pendingResolve = null
        resolve({ status: 'fail', error: 'Step response timed out' })
      }
    }, REPLAY_STEP_RESPONSE_TIMEOUT_MS)
    active.pendingResolve = (status, error) => {
      clearTimeout(timer)
      resolve({ status, error })
    }
  })
}

/**
 * Called by the message router when a `REPLAY_STEP_RESPONSE` arrives from
 * the content script. Matches it against the active replay's pending step
 * and unblocks {@link awaitStepResponse}.
 */
export function handleReplayStepResponse(
  sessionId: string,
  actionId: string,
  status: 'pass' | 'fail' | 'skipped',
  error?: string,
): void {
  if (!active) return
  if (active.sessionId !== sessionId) return
  if (active.pendingActionId !== actionId) return
  const resolve = active.pendingResolve
  active.pendingActionId = null
  active.pendingResolve = null
  resolve?.(status, error)
}

export function isReplayRunning(): boolean {
  return active !== null
}

export function abortReplay(sessionId: string): void {
  if (!active || active.sessionId !== sessionId) return
  active.aborted = true
  // If a step is in flight, free its waiter so the loop can observe the
  // abort flag immediately rather than blocking on the timeout.
  active.pendingResolve?.('fail', 'Replay aborted')
  active.pendingActionId = null
  active.pendingResolve = null
}

/**
 * Drive a stopped session's actions against the active tab. Each action is
 * sent to the content script via `REPLAY_STEP_RUN`; the script reports
 * pass/fail/skipped back through `REPLAY_STEP_RESPONSE`. Per-step progress
 * and the final tally are broadcast on the UI bus.
 */
export async function startReplay(sessionId: string): Promise<void> {
  if (active) {
    logger.warn('[BG] Replay already running; ignoring new request', sessionId)
    return
  }

  const session = await getSession(sessionId)
  if (!session) {
    await broadcastToUI({
      type: 'REPLAY_DONE',
      sessionId,
      totalSteps: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      error: 'Session not found',
    })
    return
  }

  const actions = await getActionsBySession(sessionId)
  if (actions.length === 0) {
    await broadcastToUI({
      type: 'REPLAY_DONE',
      sessionId,
      totalSteps: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      error: 'Session has no recorded actions',
    })
    return
  }

  const tab = await resolveActiveTab()
  if (!tab?.id) {
    await broadcastToUI({
      type: 'REPLAY_DONE',
      sessionId,
      totalSteps: actions.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      error: 'No active browser tab. Click into the page you want to replay against.',
    })
    return
  }

  active = {
    sessionId,
    tabId: tab.id,
    aborted: false,
    pendingResolve: null,
    pendingActionId: null,
  }
  startKeepalive()

  await broadcastToUI({ type: 'REPLAY_STARTED', sessionId, totalSteps: actions.length })

  let passed = 0
  let failed = 0
  let skipped = 0
  let runError: string | undefined

  try {
    for (let i = 0; i < actions.length; i++) {
      if (active.aborted) break
      const action = actions[i]
      await broadcastToUI({
        type: 'REPLAY_STEP_STARTED',
        sessionId,
        actionId: action.actionId,
        index: i,
      })

      const result = await runOneStep(active.tabId, action)

      if (result.status === 'pass') passed += 1
      else if (result.status === 'fail') failed += 1
      else skipped += 1

      await broadcastToUI({
        type: 'REPLAY_STEP_RESULT',
        sessionId,
        actionId: action.actionId,
        index: i,
        status: result.status,
        error: result.error,
      })

      // Navigation steps need the destination to finish loading before we
      // try to bind locators on the next step.
      if (action.type === 'navigate' && result.status === 'pass') {
        await waitForTabComplete(active.tabId, REPLAY_NAVIGATION_SETTLE_TIMEOUT_MS)
      } else if (i < actions.length - 1) {
        // Small breath so animations / focus rings settle between steps.
        await delay(REPLAY_STEP_PACING_MS)
      }
    }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err)
    logger.error('[BG] Replay loop crashed', err)
  } finally {
    const aborted = active?.aborted ?? false
    active = null
    stopKeepalive()
    await broadcastToUI({
      type: 'REPLAY_DONE',
      sessionId,
      totalSteps: actions.length,
      passed,
      failed,
      skipped,
      aborted,
      error: runError,
    })
  }
}

async function runOneStep(
  tabId: number,
  action: import('@shared/types/action').RecordedAction,
): Promise<{ status: 'pass' | 'fail' | 'skipped'; error?: string }> {
  // Network / assert / wait / screenshot have no DOM analog at replay time
  // — let the content script answer 'skipped' so the UI surfaces them
  // explicitly rather than silently treating them as passes.
  if (!action.target && action.type !== 'navigate') {
    return { status: 'skipped' }
  }

  const primary = action.target?.primaryLocator
  if (action.type !== 'navigate' && !primary) {
    return { status: 'fail', error: 'Step is missing a locator' }
  }

  try {
    await sendToTab(tabId, {
      type: 'REPLAY_STEP_RUN',
      sessionId: action.sessionId,
      actionId: action.actionId,
      actionType: action.type,
      // navigate steps don't need a locator but the message shape requires
      // both; pass a benign placeholder.
      primary: primary ?? { strategy: 'css', selector: 'body', framework: {} },
      fallbacks: action.target?.fallbackLocators ?? [],
      shadowContext: action.target?.shadowContext,
      frameContext: action.target?.frameContext,
      payload: action.payload,
    })
  } catch (err) {
    return {
      status: 'fail',
      error: `Could not reach the page (${err instanceof Error ? err.message : String(err)}).`,
    }
  }

  return awaitStepResponse(action.actionId)
}
