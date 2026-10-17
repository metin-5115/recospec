import { describe, it, expect } from 'vitest'
import { normalizeActions } from './action-normalizer'
import type { RecordedAction } from '@shared/types/action'

function makeAction(
  overrides: Partial<RecordedAction> & Pick<RecordedAction, 'type'>,
): RecordedAction {
  return {
    actionId: overrides.actionId ?? crypto.randomUUID(),
    sessionId: 'sess-1',
    sequenceNumber: 0,
    timestamp: Date.now(),
    pageUrl: 'https://example.com/login',
    ...overrides,
  }
}

function makeClickAction(id: string, locatorValue: string): RecordedAction {
  return makeAction({
    actionId: id,
    type: 'click',
    target: {
      primaryLocator: {
        strategy: 'testid',
        selector: `[data-testid="${locatorValue}"]`,
        framework: { playwright: locatorValue },
        score: 100,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: {
        tagName: 'button',
        attributes: { 'data-testid': locatorValue },
        textContent: 'Submit',
      },
    },
  })
}

function makeFillAction(id: string, locatorValue: string, value: string): RecordedAction {
  return makeAction({
    actionId: id,
    type: 'fill',
    payload: { value },
    target: {
      primaryLocator: {
        strategy: 'testid',
        selector: `[data-testid="${locatorValue}"]`,
        framework: { playwright: locatorValue },
        score: 100,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: {
        tagName: 'input',
        attributes: { 'data-testid': locatorValue },
        textContent: '',
      },
    },
  })
}

describe('normalizeActions', () => {
  it('passes through click and navigate actions', () => {
    const actions: RecordedAction[] = [
      makeAction({ type: 'navigate', actionId: 'nav-1', pageUrl: 'https://example.com/login' }),
      makeClickAction('click-1', 'submit-btn'),
    ]
    const { flatSteps } = normalizeActions(actions)
    expect(flatSteps).toHaveLength(2)
    expect(flatSteps[0].action).toBe('navigate')
    expect(flatSteps[1].action).toBe('click')
  })

  it('normalizes numeric URL segments to :id', () => {
    const actions: RecordedAction[] = [
      makeAction({ type: 'navigate', actionId: 'nav-1', pageUrl: 'https://example.com/users/123' }),
    ]
    const { flatSteps } = normalizeActions(actions)
    expect(flatSteps[0].url).toBe('/users/:id')
  })

  it('merges consecutive fills on the same element — keeps last value', () => {
    const actions: RecordedAction[] = [
      makeFillAction('fill-1', 'username-input', 'adm'),
      makeFillAction('fill-2', 'username-input', 'admi'),
      makeFillAction('fill-3', 'username-input', 'admin'),
    ]
    const { flatSteps } = normalizeActions(actions)
    expect(flatSteps).toHaveLength(1)
    expect(flatSteps[0].value).toBe('admin')
  })

  it('does NOT merge fills on different elements', () => {
    const actions: RecordedAction[] = [
      makeFillAction('fill-1', 'username-input', 'admin'),
      makeFillAction('fill-2', 'password-input', 'secret'),
    ]
    const { flatSteps } = normalizeActions(actions)
    expect(flatSteps).toHaveLength(2)
  })

  it('skips unsupported action types', () => {
    const actions: RecordedAction[] = [
      makeAction({ type: 'hover', actionId: 'hover-1' }),
      makeAction({ type: 'scroll', actionId: 'scroll-1' }),
      makeClickAction('click-1', 'btn'),
    ]
    const { flatSteps } = normalizeActions(actions)
    expect(flatSteps).toHaveLength(1)
    expect(flatSteps[0].action).toBe('click')
  })

  it('captures elementSnapshot summary on the IRElement', () => {
    const action = makeAction({
      actionId: 'click-1',
      type: 'click',
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: '[data-testid="submit"]',
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: {
          tagName: 'button',
          attributes: {
            'data-testid': 'submit',
            id: 'main-submit',
            class: 'btn primary',
            role: 'button',
          },
          textContent: 'Sign In',
        },
      },
    })

    const { flatSteps } = normalizeActions([action])
    const snap = flatSteps[0].element?.elementSnapshot
    expect(snap).toBeDefined()
    expect(snap).toEqual({
      localName: 'button',
      textContent: 'Sign In',
      id: 'main-submit',
      className: 'btn primary',
      testId: 'submit',
      role: 'button',
    })
  })

  it('omits absent snapshot fields rather than setting them to empty', () => {
    const action = makeAction({
      actionId: 'click-1',
      type: 'click',
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: '[data-testid="submit"]',
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: {
          tagName: 'button',
          attributes: { 'data-testid': 'submit' },
          textContent: '',
        },
      },
    })

    const snap = normalizeActions([action]).flatSteps[0].element?.elementSnapshot
    expect(snap).toEqual({ localName: 'button', testId: 'submit' })
    expect(snap).not.toHaveProperty('textContent')
    expect(snap).not.toHaveProperty('id')
    expect(snap).not.toHaveProperty('className')
    expect(snap).not.toHaveProperty('role')
  })

  it('propagates fallback locators with strategy + value', () => {
    const action = makeAction({
      actionId: 'click-1',
      type: 'click',
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: '[data-testid="email"]',
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [
          {
            strategy: 'aria-label',
            selector: '[aria-label="Email"]',
            framework: {},
            score: 80,
            matchCount: 1,
          },
          {
            strategy: 'role-name',
            selector: `'textbox', { name: 'Email' }`,
            framework: {},
            score: 70,
            matchCount: 1,
          },
        ],
        elementSnapshot: { tagName: 'input', attributes: {}, textContent: '' },
      },
    })

    const fallbacks = normalizeActions([action]).flatSteps[0].element?.fallbackLocators
    expect(fallbacks).toEqual([
      { strategy: 'aria-label', locatorValue: '[aria-label="Email"]' },
      { strategy: 'role-name', locatorValue: `'textbox', { name: 'Email' }` },
    ])
  })

  it('leaves fallbackLocators undefined when none are recorded', () => {
    const action = makeClickAction('click-1', 'btn')
    const element = normalizeActions([action]).flatSteps[0].element
    expect(element?.fallbackLocators).toBeUndefined()
  })
})

function makeTargetAction(
  id: string,
  type: RecordedAction['type'],
  locatorValue: string,
  tagName: string,
  payload?: Record<string, unknown>,
  attributes: Record<string, string> = {},
): RecordedAction {
  return makeAction({
    actionId: id,
    type,
    payload,
    target: {
      primaryLocator: {
        strategy: 'testid',
        selector: `[data-testid="${locatorValue}"]`,
        framework: { playwright: locatorValue },
        score: 100,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: {
        tagName,
        attributes: { 'data-testid': locatorValue, ...attributes },
        textContent: '',
      },
    },
  })
}

describe('normalizeActions — richer interactions', () => {
  it('keeps select actions with their chosen value', () => {
    const { flatSteps } = normalizeActions([
      makeTargetAction('s1', 'select', 'country', 'select', { value: 'tr' }),
    ])
    expect(flatSteps).toHaveLength(1)
    expect(flatSteps[0].action).toBe('select')
    expect(flatSteps[0].value).toBe('tr')
    expect(flatSteps[0].element?.tagName).toBe('select')
  })

  it.each(['check', 'uncheck', 'hover', 'dblclick'] as const)('keeps %s actions', (type) => {
    const { flatSteps } = normalizeActions([makeTargetAction('a1', type, 'target', 'input')])
    expect(flatSteps).toHaveLength(1)
    expect(flatSteps[0].action).toBe(type)
    expect(flatSteps[0].element).toBeDefined()
  })

  it('collapses the two click events that precede a dblclick on the same element', () => {
    const { flatSteps } = normalizeActions([
      makeTargetAction('c0', 'click', 'other', 'button'),
      makeTargetAction('c1', 'click', 'row', 'tr'),
      makeTargetAction('c2', 'click', 'row', 'tr'),
      makeTargetAction('d1', 'dblclick', 'row', 'tr'),
    ])
    expect(flatSteps.map((s) => s.action)).toEqual(['click', 'dblclick'])
    expect(flatSteps[0].element?.locatorValue).toContain('other')
  })

  it('does not collapse clicks on a different element than the dblclick', () => {
    const { flatSteps } = normalizeActions([
      makeTargetAction('c1', 'click', 'a', 'button'),
      makeTargetAction('d1', 'dblclick', 'b', 'button'),
    ])
    expect(flatSteps.map((s) => s.action)).toEqual(['click', 'dblclick'])
  })

  it('drops an action without a target instead of emitting an empty step', () => {
    const { flatSteps } = normalizeActions([
      makeAction({ type: 'select', payload: { value: 'x' } }),
    ])
    expect(flatSteps).toHaveLength(0)
  })
})

describe('normalizeActions — focus clicks before typing', () => {
  it('drops the click that only focuses the field about to be filled', () => {
    const { flatSteps } = normalizeActions([
      makeTargetAction('c1', 'click', 'email', 'input'),
      makeTargetAction('f1', 'fill', 'email', 'input', { value: 'user@example.com' }),
    ])
    expect(flatSteps.map((s) => s.action)).toEqual(['fill'])
    expect(flatSteps[0].value).toBe('user@example.com')
  })

  it('drops the click that only opens the select it then changes', () => {
    const { flatSteps } = normalizeActions([
      makeTargetAction('c1', 'click', 'country', 'select'),
      makeTargetAction('s1', 'select', 'country', 'select', { value: 'tr' }),
    ])
    expect(flatSteps.map((s) => s.action)).toEqual(['select'])
  })

  it('keeps a click on a different element than the one filled next', () => {
    const { flatSteps } = normalizeActions([
      makeTargetAction('c1', 'click', 'menu', 'button'),
      makeTargetAction('f1', 'fill', 'search', 'input', { value: 'shoes' }),
    ])
    expect(flatSteps.map((s) => s.action)).toEqual(['click', 'fill'])
  })

  it('keeps the click when another step sits between it and the fill', () => {
    const { flatSteps } = normalizeActions([
      makeTargetAction('c1', 'click', 'email', 'input'),
      makeTargetAction('c2', 'click', 'terms', 'input'),
      makeTargetAction('f1', 'fill', 'email', 'input', { value: 'user@example.com' }),
    ])
    expect(flatSteps.map((s) => s.action)).toEqual(['click', 'click', 'fill'])
  })

  it('keeps a click that is not followed by typing', () => {
    const { flatSteps } = normalizeActions([makeTargetAction('c1', 'click', 'email', 'input')])
    expect(flatSteps.map((s) => s.action)).toEqual(['click'])
  })

  it('merges consecutive fills of one field into a single step', () => {
    const { flatSteps } = normalizeActions([
      makeTargetAction('c1', 'click', 'email', 'input'),
      makeTargetAction('f1', 'fill', 'email', 'input', { value: 'user@' }),
      makeTargetAction('f2', 'fill', 'email', 'input', { value: 'user@example.com' }),
    ])
    expect(flatSteps).toHaveLength(1)
    expect(flatSteps[0].value).toBe('user@example.com')
  })
})

describe('normalizeActions — page URL per step', () => {
  it('carries the normalized route of the page each interaction happened on', () => {
    const { flatSteps } = normalizeActions([
      makeAction({ ...makeClickAction('c1', 'a'), pageUrl: 'https://example.com/orders/123' }),
      makeAction({ ...makeClickAction('c2', 'b'), pageUrl: 'https://example.com/cart' }),
    ])
    expect(flatSteps.map((s) => s.pageUrl)).toEqual(['/orders/:id', '/cart'])
  })

  it('leaves navigate steps with their own url only', () => {
    const { flatSteps } = normalizeActions([
      makeAction({ type: 'navigate', actionId: 'n1', pageUrl: 'https://example.com/login' }),
    ])
    expect(flatSteps[0]!.url).toBe('/login')
    expect(flatSteps[0]!.pageUrl).toBeUndefined()
  })
})
