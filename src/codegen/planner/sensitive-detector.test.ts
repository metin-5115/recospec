import { describe, it, expect } from 'vitest'
import { isSensitiveField, getParameterName, getEnvVarName } from './sensitive-detector'
import type { IRElement } from '../ir/types'

function el(partial: Partial<IRElement>): IRElement {
  return {
    name: 'someInput',
    locatorStrategy: 'css',
    locatorValue: '#x',
    tagName: 'input',
    ...partial,
  }
}

describe('isSensitiveField', () => {
  it('detects input[type=password]', () => {
    expect(isSensitiveField(el({ inputType: 'password' }))).toBe(true)
  })

  it('detects autocomplete=current-password', () => {
    expect(
      isSensitiveField(
        el({
          inputType: 'text',
          elementSnapshot: { localName: 'input', autocomplete: 'current-password' },
        }),
      ),
    ).toBe(true)
  })

  it('detects autocomplete=email', () => {
    expect(
      isSensitiveField(
        el({
          inputType: 'email',
          elementSnapshot: { localName: 'input', autocomplete: 'email' },
        }),
      ),
    ).toBe(true)
  })

  it('detects autocomplete=one-time-code', () => {
    expect(
      isSensitiveField(
        el({
          inputType: 'text',
          elementSnapshot: { localName: 'input', autocomplete: 'one-time-code' },
        }),
      ),
    ).toBe(true)
  })

  it('detects field name regex (passwordInput)', () => {
    expect(isSensitiveField(el({ name: 'passwordInput' }))).toBe(true)
  })

  it('detects field name regex (apiKeyField)', () => {
    expect(isSensitiveField(el({ name: 'apiKeyField' }))).toBe(true)
  })

  it('detects field via id attribute', () => {
    expect(
      isSensitiveField(
        el({
          name: 'firstField',
          elementSnapshot: { localName: 'input', id: 'login_password' },
        }),
      ),
    ).toBe(true)
  })

  it('detects field via name attribute', () => {
    expect(
      isSensitiveField(
        el({
          name: 'foo',
          elementSnapshot: { localName: 'input', fieldName: 'auth_token' },
        }),
      ),
    ).toBe(true)
  })

  it('does NOT flag plain text inputs', () => {
    expect(isSensitiveField(el({ name: 'firstNameInput', inputType: 'text' }))).toBe(false)
  })

  it('does NOT flag search inputs', () => {
    expect(isSensitiveField(el({ name: 'searchBox', inputType: 'search' }))).toBe(false)
  })

  it('does NOT flag undefined element', () => {
    expect(isSensitiveField(undefined)).toBe(false)
  })

  it('avoids false positive on "passenger" (regex word boundary not enforced for password)', () => {
    // Documenting current behavior: substring "passenger" contains "passe..." but
    // not "password", so this should NOT match.
    expect(isSensitiveField(el({ name: 'passengerNameInput' }))).toBe(false)
  })
})

describe('getParameterName', () => {
  it('returns "password" for password inputs', () => {
    expect(getParameterName(el({ inputType: 'password' }))).toBe('password')
  })

  it('returns "email" for autocomplete=email', () => {
    expect(
      getParameterName(el({ elementSnapshot: { localName: 'input', autocomplete: 'email' } })),
    ).toBe('email')
  })

  it('returns "oneTimeCode" for autocomplete=one-time-code', () => {
    expect(
      getParameterName(
        el({ elementSnapshot: { localName: 'input', autocomplete: 'one-time-code' } }),
      ),
    ).toBe('oneTimeCode')
  })

  it('returns "apiKey" for api_key field name', () => {
    expect(
      getParameterName(
        el({ name: 'fooInput', elementSnapshot: { localName: 'input', fieldName: 'api_key' } }),
      ),
    ).toBe('apiKey')
  })

  it('falls back to camelCase element-name slug', () => {
    expect(getParameterName(el({ name: 'firstNameInput' }))).toBe('firstName')
  })
})

describe('getEnvVarName', () => {
  it('produces RECOSPEC_PASSWORD', () => {
    expect(getEnvVarName('password')).toBe('RECOSPEC_PASSWORD')
  })

  it('produces RECOSPEC_API_KEY from camelCase', () => {
    expect(getEnvVarName('apiKey')).toBe('RECOSPEC_API_KEY')
  })

  it('produces RECOSPEC_ONE_TIME_CODE from camelCase', () => {
    expect(getEnvVarName('oneTimeCode')).toBe('RECOSPEC_ONE_TIME_CODE')
  })

  it('handles already-snake input', () => {
    expect(getEnvVarName('user_name')).toBe('RECOSPEC_USER_NAME')
  })
})

describe('payment card fields', () => {
  it.each(['cardNumberInput', 'cvvInput', 'cvcInput', 'securityCodeInput', 'expiryInput'])(
    'treats %s as sensitive',
    (name) => {
      expect(isSensitiveField(el({ name }))).toBe(true)
    },
  )

  it.each(['cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year'])(
    'treats autocomplete=%s as sensitive',
    (autocomplete) => {
      expect(isSensitiveField(el({ elementSnapshot: { localName: 'input', autocomplete } }))).toBe(
        true,
      )
    },
  )

  it.each(['nameOnCardInput', 'fullNameInput', 'postalCodeInput', 'cityInput', 'addressInput'])(
    'does not flag %s',
    (name) => {
      expect(isSensitiveField(el({ name }))).toBe(false)
    },
  )

  it('maps card fields to canonical parameter names and env vars', () => {
    expect(getParameterName(el({ name: 'cardNumberInput' }))).toBe('cardNumber')
    expect(getParameterName(el({ name: 'cvvInput' }))).toBe('cvv')
    expect(getParameterName(el({ name: 'securityCodeInput' }))).toBe('cvv')
    expect(getParameterName(el({ name: 'expiryInput' }))).toBe('cardExpiry')
    expect(
      getParameterName(el({ elementSnapshot: { localName: 'input', autocomplete: 'cc-number' } })),
    ).toBe('cardNumber')
    expect(
      getParameterName(el({ elementSnapshot: { localName: 'input', autocomplete: 'cc-csc' } })),
    ).toBe('cvv')
    expect(getEnvVarName('cardNumber')).toBe('RECOSPEC_CARD_NUMBER')
    expect(getEnvVarName('cvv')).toBe('RECOSPEC_CVV')
    expect(getEnvVarName('cardExpiry')).toBe('RECOSPEC_CARD_EXPIRY')
  })
})
