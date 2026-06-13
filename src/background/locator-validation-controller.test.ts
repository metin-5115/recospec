import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  handleHighlightLocator,
  handleValidateLocators,
  handleValidationResponse,
} from './locator-validation-controller'
import type { LocatorValidationTarget } from '@shared/types/messages'
import type { ScoredLocator } from '@shared/types/locator'

interface ChromeStub {
  windows?: { getLastFocused?: ReturnType<typeof vi.fn> }
  tabs: {
    query: ReturnType<typeof vi.fn>
    sendMessage: ReturnType<typeof vi.fn>
  }
  runtime: { sendMessage: ReturnType<typeof vi.fn> }
}

const broadcasts: unknown[] = []
const tabMessages: unknown[] = []

function loc(strategy: ScoredLocator['strategy'], selector: string): ScoredLocator {
  return { strategy, selector, framework: {}, score: 80, matchCount: 1 }
}

function target(actionId: string, primarySelector = '#x'): LocatorValidationTarget {
  return {
    actionId,
    index: 0,
    label: actionId,
    primary: loc('css', primarySelector),
    fallbacks: [],
  }
}

function installChrome(activeTabId: number | undefined): ChromeStub {
  broadcasts.length = 0
  tabMessages.length = 0
  const stub: ChromeStub = {
    tabs: {
      query: vi.fn(async () =>
        activeTabId !== undefined ? [{ id: activeTabId, url: 'https://app.test/page' }] : [],
      ),
      sendMessage: vi.fn(async (_id: number, msg: unknown) => {
        tabMessages.push(msg)
      }),
    },
    runtime: {
      sendMessage: vi.fn(async (msg: unknown) => {
        broadcasts.push(msg)
      }),
    },
    windows: {
      getLastFocused: vi.fn(async () => ({
        tabs:
          activeTabId !== undefined
            ? [{ id: activeTabId, active: true, url: 'https://app.test/page' }]
            : [],
      })),
    },
  }
  ;(globalThis as unknown as { chrome: ChromeStub }).chrome = stub
  return stub
}

describe('locator-validation-controller', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('forwards VALIDATE_LOCATORS to the active tab and broadcasts results on response', async () => {
    installChrome(42)
    const targets = [target('a1', '#a'), target('a2', '#b')]

    await handleValidateLocators('s1', targets, 'https://app.test/page')
    expect(tabMessages).toHaveLength(1)
    expect((tabMessages[0] as { type: string }).type).toBe('VALIDATE_LOCATORS_RUN')

    await handleValidationResponse(
      's1',
      targets.map((t) => ({
        actionId: t.actionId,
        index: t.index,
        label: t.label,
        primary: {
          strategy: 'css',
          selector: t.primary.selector,
          status: 'matched',
          matchCount: 1,
        },
        fallbacks: [],
      })),
      120,
      'https://app.test/page',
    )

    const result = broadcasts.find(
      (m) =>
        typeof m === 'object' &&
        m !== null &&
        (m as { type?: string }).type === 'LOCATOR_VALIDATION_RESULT',
    ) as { results: unknown[]; durationMs: number } | undefined
    expect(result).toBeTruthy()
    expect(result!.results).toHaveLength(2)
    expect(result!.durationMs).toBe(120)
  })

  it('annotates results with urlMismatch when active page origin differs from recorded origin', async () => {
    installChrome(42)
    await handleValidateLocators('s2', [target('a1')], 'https://recorded.test/login')
    await handleValidationResponse(
      's2',
      [
        {
          actionId: 'a1',
          index: 0,
          label: 'x',
          primary: { strategy: 'css', selector: '#x', status: 'matched', matchCount: 1 },
          fallbacks: [],
        },
      ],
      10,
      'https://other.test/page',
    )
    const result = broadcasts.find(
      (m) => (m as { type?: string }).type === 'LOCATOR_VALIDATION_RESULT',
    ) as { results: { urlMismatch?: boolean }[] }
    expect(result.results[0].urlMismatch).toBe(true)
  })

  it('broadcasts an error when no active tab is found', async () => {
    installChrome(undefined)
    await handleValidateLocators('s3', [target('a1')])
    const result = broadcasts.find(
      (m) => (m as { type?: string }).type === 'LOCATOR_VALIDATION_RESULT',
    ) as { error: string }
    expect(result.error).toMatch(/No active browser tab/i)
  })

  it('caps targets at LOCATOR_VALIDATION_MAX_TARGETS and reports truncation', async () => {
    installChrome(42)
    const many: LocatorValidationTarget[] = Array.from({ length: 150 }, (_, i) => target(`a${i}`))
    await handleValidateLocators('s4', many)
    const sent = tabMessages[0] as { targets: unknown[] }
    expect(sent.targets.length).toBe(100)

    await handleValidationResponse(
      's4',
      Array.from({ length: 100 }, (_, i) => ({
        actionId: `a${i}`,
        index: i,
        label: `a${i}`,
        primary: {
          strategy: 'css' as const,
          selector: '#x',
          status: 'matched' as const,
          matchCount: 1,
        },
        fallbacks: [],
      })),
      99,
      'https://app.test/page',
    )
    const result = broadcasts.find(
      (m) => (m as { type?: string }).type === 'LOCATOR_VALIDATION_RESULT',
    ) as { truncated?: number }
    expect(result.truncated).toBe(150)
  })

  it('handleHighlightLocator forwards a HIGHLIGHT_LOCATOR_ON_PAGE message to the active tab', async () => {
    installChrome(42)
    await handleHighlightLocator(
      's5',
      { strategy: 'css', selector: '#x', framework: {} },
      undefined,
      undefined,
      'OK button',
    )
    const sent = tabMessages[0] as { type: string; label: string }
    expect(sent.type).toBe('HIGHLIGHT_LOCATOR_ON_PAGE')
    expect(sent.label).toBe('OK button')
  })
})
