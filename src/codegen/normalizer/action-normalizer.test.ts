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
})
