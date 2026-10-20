import { describe, it, expect } from 'vitest'
import type { RecordedAction } from '@shared/types/action'
import { maskSecretActions } from './secret-mask'

function action(
  type: RecordedAction['type'],
  attributes: Record<string, string>,
  payload?: Record<string, unknown>,
  id = crypto.randomUUID(),
): RecordedAction {
  return {
    actionId: id,
    sessionId: 's',
    sequenceNumber: 0,
    type,
    timestamp: 0,
    pageUrl: 'https://shop.test/login',
    payload,
    target: {
      primaryLocator: {
        strategy: 'testid',
        selector: `[data-testid="${attributes['data-testid']}"]`,
        framework: {},
        score: 90,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: { tagName: 'input', attributes, textContent: '' },
    },
  }
}

const password = (value: string) =>
  action('fill', { 'data-testid': 'password', type: 'password' }, { value })
const search = (value: string) =>
  action('fill', { 'data-testid': 'search', type: 'search' }, { value })

describe('maskSecretActions', () => {
  it('replaces the typed value of a sensitive field and reports it', () => {
    const { actions, secrets } = maskSecretActions([password('hunter2-long')])
    expect(actions[0]?.payload?.value).toBe('[REDACTED:RECOSPEC_PASSWORD]')
    expect(secrets).toEqual(['hunter2-long'])
  })

  it('numbers further distinct values and reuses the mask of an equal one', () => {
    const { actions } = maskSecretActions([password('aaaa1'), password('bbbb2'), password('aaaa1')])
    expect(actions.map((a) => a.payload?.value)).toEqual([
      '[REDACTED:RECOSPEC_PASSWORD]',
      '[REDACTED:RECOSPEC_PASSWORD#2]',
      '[REDACTED:RECOSPEC_PASSWORD]',
    ])
  })

  it('keeps a search query, an empty value and non-fill actions', () => {
    const input = [search('running shoes'), password(''), action('click', { 'data-testid': 'go' })]
    expect(maskSecretActions(input).actions).toEqual(input)
  })

  it('masks what a value assertion expects from a sensitive field', () => {
    const assertion = action(
      'assert',
      { 'data-testid': 'password', type: 'password' },
      { assertionType: 'value', expected: 'hunter2-long' },
    )
    expect(maskSecretActions([assertion]).actions[0]?.payload?.expected).toBe(
      '[REDACTED:RECOSPEC_PASSWORD]',
    )
  })

  it('drops the prefilled value attribute of a sensitive field', () => {
    const prefilled = action('click', {
      'data-testid': 'password',
      type: 'password',
      value: 'prefilled-secret',
    })
    const { actions, secrets } = maskSecretActions([prefilled])
    expect(actions[0]?.target?.elementSnapshot.attributes).not.toHaveProperty('value')
    expect(secrets).toEqual(['prefilled-secret'])
  })

  it('masks tokens in a response body recorded before capture-time masking', () => {
    const network = action(
      'network',
      {},
      {
        method: 'POST',
        url: 'https://shop.test/api/login',
        contentType: 'application/json',
        responseBody: '{"token":"abc.def.ghi-secret","name":"Ada"}',
      },
    )
    delete network.target
    const body = maskSecretActions([network]).actions[0]?.payload?.responseBody
    expect(String(body)).not.toContain('abc.def.ghi-secret')
    expect(String(body)).toContain('Ada')
  })

  it('does not change the input', () => {
    const input = [password('hunter2-long')]
    maskSecretActions(input)
    expect(input[0]?.payload?.value).toBe('hunter2-long')
  })
})
