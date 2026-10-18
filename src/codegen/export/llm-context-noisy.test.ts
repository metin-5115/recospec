import { describe, it, expect } from 'vitest'
import { buildLlmContext } from './llm-context'
import { renderLlmContextCompact, renderLlmContextJson } from './llm-context-render'
import type { JsonExportPayload } from './json-export'
import type { RecordedAction } from '@shared/types/action'
import type { Locator, ScoredLocator } from '@shared/types/locator'
import type { Session } from '@shared/types/session'

/**
 * A recording shaped like a real e-commerce/airline session: CSS-module classes, hover-state
 * classes, masked fingerprints, tracker beacons and repeated API polling.
 */

const BASE = 'https://shop.example.com'
const PAGE_URL = `${BASE}/booking`

const session: Session = {
  sessionId: 's1',
  name: 'Booking Search',
  state: 'stopped',
  startUrl: PAGE_URL,
  startedAt: 1,
  stoppedAt: 2,
  metadata: { userAgent: 't', viewport: { width: 1280, height: 800 }, timezone: 'UTC' },
  config: { captureClicks: true, captureInputs: true, captureNavigation: true },
  iterationNumber: 1,
  flowSignature: 'sig',
}

const HASHED_XPATH =
  "//div[contains(concat(' ', normalize-space(@class), ' '), \" hm__style_dropdown__3tpXH \")]/button"
const LONG_XPATH = `//section[${"contains(@class, 'some-long-semantic-class-name') and ".repeat(5)}true()]/button`

function scored(strategy: Locator['strategy'], selector: string): ScoredLocator {
  return { strategy, selector, framework: {}, score: 80, matchCount: 1 } as ScoredLocator
}

function click(idx: number, primary: ScoredLocator, fallbacks: ScoredLocator[]): RecordedAction {
  return {
    actionId: `a${idx}`,
    sessionId: 's1',
    sequenceNumber: idx,
    type: 'click',
    timestamp: idx,
    pageUrl: PAGE_URL,
    target: {
      primaryLocator: primary,
      fallbackLocators: fallbacks,
      elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Search flights' },
      fingerprint: {
        tag: 'button',
        attributes: {
          id: 'buttonSearch',
          name: 'searchflights',
          type: 'button',
          tabindex: '«dynamic»',
          'aria-expanded': 'false',
          'aria-current': 'false',
        },
        role: null,
        accessibleName: 'Search flights',
        neighborTexts: ['«dynamic»', 'Sort by'],
        domPath: 'body>div>div>div>button',
        boundingBoxRatio: { x: 0.8123, y: 0.22 },
      },
    },
  }
}

function network(idx: number, method: string, url: string, status: number): RecordedAction {
  return {
    actionId: `n${idx}`,
    sessionId: 's1',
    sequenceNumber: idx,
    type: 'network',
    timestamp: idx,
    pageUrl: PAGE_URL,
    payload: { method, url, status, contentType: 'application/json' },
  }
}

const assertion: RecordedAction = {
  ...click(50, scored('role-name', 'heading[name="Results"]'), []),
  actionId: 'assert-1',
  type: 'assert',
  payload: { assertionType: 'visible' },
}

const requests = [
  network(10, 'POST', `${BASE}/api/v1/availability`, 200),
  network(11, 'POST', `${BASE}/api/v1/availability`, 200),
  network(12, 'POST', `${BASE}/api/v1/availability`, 200),
  network(13, 'GET', `${BASE}/api/v1/translations`, 200),
  network(14, 'POST', 'https://px.ads.linkedin.com/wa/', 200),
  network(15, 'POST', 'https://www.google.com/ccm/collect', 0),
  network(
    16,
    'POST',
    'https://ad.doubleclick.net/activity;src=1;auiddc=1508882565.1789450530;u58=x',
    200,
  ),
]

function payload(extra: RecordedAction[]): JsonExportPayload {
  const actions = [
    click(1, scored('role-name', 'button[name="Search flights"]'), [
      scored('xpath', HASHED_XPATH),
      scored('xpath', LONG_XPATH),
      scored('id', '#buttonSearch'),
      scored('css', 'button[type="submit"]'),
    ]),
    click(2, scored('css', 'button.react-calendar__tile--hover.day'), [scored('id', '#day')]),
    ...requests,
    ...extra,
  ]
  return { exportedAt: 1_715_000_000_000, formatVersion: 1, session, actions }
}

const compact = (extra: RecordedAction[], task: 'codegen' | 'heal' | 'both' = 'both'): string =>
  renderLlmContextCompact(buildLlmContext(payload(extra), { task, framework: 'playwright-ts' }))

describe('network section', () => {
  it('is omitted when the flow has no assertion', () => {
    const text = compact([])
    expect(text).not.toContain('@net')
    expect(text).not.toContain('Mock only')
  })

  it('is omitted for healing even when an assertion exists', () => {
    expect(compact([assertion], 'heal')).not.toContain('@net')
  })

  it('lists only same-origin calls with a status, folding repeats', () => {
    const text = compact([assertion])
    expect(text).toContain('POST /api/v1/availability 200 json ×3')
    expect(text).toContain('GET /api/v1/translations 200 json')
    expect(text).not.toMatch(/linkedin|doubleclick|google|auiddc|;src=/)
    expect(text).toContain('Mock only')
  })

  it('carries the repeat count in JSON', () => {
    const json = JSON.parse(
      renderLlmContextJson(
        buildLlmContext(payload([assertion]), { task: 'codegen', framework: 'playwright-ts' }),
      ),
    ) as { net: unknown[][] }
    expect(json.net).toContainEqual(['POST', '/api/v1/availability', 200, 'json', 3])
    expect(json.net).toHaveLength(2)
  })
})

describe('fallback filtering', () => {
  const text = compact([])

  it('drops fallbacks built on generated classes or longer than the cap', () => {
    expect(text).not.toContain('hm__style')
    expect(text).not.toContain('some-long-semantic-class-name')
  })

  it('keeps short durable fallbacks', () => {
    expect(text).toContain('~ id:#buttonSearch')
    expect(text).toContain('~ css:button[type="submit"]')
  })
})

describe('fingerprint filtering', () => {
  const text = compact([])
  const fpLine = text.split('\n').find((l) => l.startsWith('e1 ') && l.includes('box=')) ?? ''

  it('omits masked values and UI-state attributes', () => {
    expect(text).not.toContain('«dynamic»')
    expect(text).not.toContain('aria-expanded')
    expect(text).not.toContain('tabindex')
    expect(text).not.toContain('aria-current')
  })

  it('omits a path made only of div ancestors but keeps useful neighbours and box', () => {
    expect(fpLine).not.toContain('path=')
    expect(fpLine).toContain('near=Sort by')
    expect(fpLine).toContain('box=.81,.22')
    expect(fpLine).toContain('a=name:searchflights')
  })
})

describe('fragile primary locators', () => {
  it('marks a primary built on a transient state class with !', () => {
    const line =
      compact([])
        .split('\n')
        .find((l) => l.includes('css:button.react-calendar')) ?? ''
    expect(line.endsWith(' !')).toBe(true)
  })

  it('does not mark a durable role-name primary', () => {
    const line =
      compact([])
        .split('\n')
        .find((l) => l.includes('role:button[name="Search')) ?? ''
    expect(line).not.toContain(' !')
  })
})

describe('fingerprint attributes that repeat what the line already says', () => {
  const LONG_LABEL = 'Economy cabin lowest fare: details of the fare package, select to continue'

  function healText(): string {
    const action = click(1, scored('aria-label', `[aria-label="${LONG_LABEL}"]`), [
      scored('id', '#buttonSearch'),
    ])
    action.target!.fingerprint = {
      ...action.target!.fingerprint!,
      attributes: {
        role: 'button',
        'aria-label': LONG_LABEL,
        id: 'buttonSearch',
        'data-qa': 'fare-card',
      },
      accessibleName: LONG_LABEL,
    }
    const data: JsonExportPayload = { ...payload([]), actions: [action] }
    return renderLlmContextCompact(
      buildLlmContext(data, { task: 'heal', framework: 'playwright-ts' }),
    )
  }

  it('drops an attribute equal to the full label even when the label is shortened', () => {
    const fp =
      healText()
        .split('\n')
        .find((l) => l.startsWith('e1 ') && l.includes('box=')) ?? ''
    expect(fp).not.toContain('aria-label:')
  })

  it('drops an attribute whose value appears in a locator of the element', () => {
    const fp =
      healText()
        .split('\n')
        .find((l) => l.startsWith('e1 ') && l.includes('box=')) ?? ''
    expect(fp).not.toContain('id:buttonSearch')
  })

  it('keeps an attribute that no locator or label mentions', () => {
    const fp =
      healText()
        .split('\n')
        .find((l) => l.startsWith('e1 ') && l.includes('box=')) ?? ''
    expect(fp).toContain('data-qa:fare-card')
  })
})
