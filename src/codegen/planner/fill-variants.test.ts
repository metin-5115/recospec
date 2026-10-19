import { describe, it, expect } from 'vitest'
import {
  deriveFillVariants,
  fillEnvVarName,
  isFailingFlow,
  withFillVariants,
} from './fill-variants'
import { valueFingerprint } from '../shared/value-fingerprint'
import type { IRElement, IRStep } from '../ir/types'

const email: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: 'email',
  tagName: 'input',
  inputType: 'email',
}
const password: IRElement = {
  name: 'passwordInput',
  locatorStrategy: 'testid',
  locatorValue: 'password',
  tagName: 'input',
  inputType: 'password',
}
const submit: IRElement = {
  name: 'signInBtn',
  locatorStrategy: 'testid',
  locatorValue: 'sign-in',
  tagName: 'button',
}
const welcome: IRElement = {
  name: 'welcomeHeading',
  locatorStrategy: 'text',
  locatorValue: 'Welcome',
  tagName: 'h1',
}
const errorBanner: IRElement = {
  name: 'loginError',
  locatorStrategy: 'testid',
  locatorValue: 'login-error',
  tagName: 'div',
}

const fill = (id: string, element: IRElement, value: string, pageUrl = '/login'): IRStep => ({
  id,
  action: 'fill',
  element,
  value,
  pageUrl,
})
const clickSubmit = (id: string, pageUrl = '/login'): IRStep => ({
  id,
  action: 'click',
  element: submit,
  pageUrl,
})

const rejected = (id: string, pageUrl = '/login'): IRStep => ({
  id,
  action: 'network',
  network: { method: 'POST', url: '/api/login', status: 401 },
  pageUrl,
})

const failedLogin: IRStep[] = [
  fill('1', email, 'ada@example.com'),
  fill('2', password, 'wrong-pass'),
  clickSubmit('3'),
  rejected('3b'),
]

describe('isFailingFlow', () => {
  it('is true when the flow asserts an error message', () => {
    const steps: IRStep[] = [
      ...failedLogin,
      {
        id: '4',
        action: 'assert',
        element: errorBanner,
        assertionDetail: { type: 'text', expected: 'Invalid credentials' },
        pageUrl: '/login',
      },
    ]
    expect(isFailingFlow(steps)).toBe(true)
  })

  it('is true when the sign-in request is rejected', () => {
    expect(isFailingFlow(failedLogin)).toBe(true)
  })

  it('is true when the user keeps working on the same page after submitting', () => {
    const steps: IRStep[] = [
      fill('1', password, 'wrong-pass'),
      clickSubmit('2'),
      { id: '3', action: 'click', element: email, pageUrl: '/login' },
    ]
    expect(isFailingFlow(steps)).toBe(true)
  })

  it('proves nothing when the recording simply stops at the submit', () => {
    expect(isFailingFlow([fill('1', password, 'pass-1234'), clickSubmit('2')])).toBe(false)
  })

  it('is false when the flow moves on to another page', () => {
    const steps: IRStep[] = [...failedLogin, clickSubmit('4', '/dashboard')]
    expect(isFailingFlow(steps)).toBe(false)
  })

  it('is false when a navigation follows the submit', () => {
    const steps: IRStep[] = [...failedLogin, { id: '4', action: 'navigate', url: '/dashboard' }]
    expect(isFailingFlow(steps)).toBe(false)
  })

  it('is false when nothing was submitted', () => {
    expect(isFailingFlow([fill('1', password, 'secret-1')])).toBe(false)
  })

  it('does not mistake an ordinary assertion for a failure', () => {
    const steps: IRStep[] = [
      ...failedLogin,
      clickSubmit('4', '/dashboard'),
      {
        id: '5',
        action: 'assert',
        element: welcome,
        assertionDetail: { type: 'visible' },
        pageUrl: '/dashboard',
      },
    ]
    expect(isFailingFlow(steps)).toBe(false)
  })
})

describe('deriveFillVariants', () => {
  it('sends the only password of a failing flow to the _INVALID variable', () => {
    const [variant, ...rest] = deriveFillVariants(failedLogin)
    expect(rest).toEqual([])
    expect(variant).toMatchObject({
      key: 'passwordInput#INVALID',
      baseKey: 'passwordInput',
      paramName: 'passwordInvalid',
      envVarName: 'RECOSPEC_PASSWORD_INVALID',
      valueFingerprint: valueFingerprint('wrong-pass'),
      replacesBase: true,
    })
  })

  it('leaves the non-credential fields of a failing flow on their own variables', () => {
    expect(deriveFillVariants(failedLogin).map((v) => v.baseKey)).toEqual(['passwordInput'])
  })

  it('keeps a successful flow on the base variable', () => {
    const steps: IRStep[] = [
      fill('1', email, 'ada@example.com'),
      fill('2', password, 'right-pass'),
      clickSubmit('3'),
      clickSubmit('4', '/dashboard'),
    ]
    expect(deriveFillVariants(steps)).toEqual([])
  })

  it('maps a second, different password in a failing flow to _INVALID and keeps the first as base', () => {
    const steps: IRStep[] = [
      fill('1', password, 'right-pass'),
      clickSubmit('2', '/dashboard'),
      fill('3', password, 'wrong-pass', '/settings'),
      clickSubmit('4', '/settings'),
      rejected('5', '/settings'),
    ]
    const variants = deriveFillVariants(steps)
    expect(variants).toHaveLength(1)
    expect(variants[0]).toMatchObject({
      envVarName: 'RECOSPEC_PASSWORD_INVALID',
      valueFingerprint: valueFingerprint('wrong-pass'),
      replacesBase: false,
    })
  })

  it('numbers extra values when the flow does not fail', () => {
    const steps: IRStep[] = [
      fill('1', password, 'first-pass'),
      fill('2', password, 'second-pass'),
      fill('3', password, 'third-pass'),
      clickSubmit('4', '/dashboard'),
    ]
    expect(deriveFillVariants(steps).map((v) => v.envVarName)).toEqual([
      'RECOSPEC_PASSWORD_2',
      'RECOSPEC_PASSWORD_3',
    ])
  })

  it('does not create a variant for a repeated identical value', () => {
    const steps: IRStep[] = [
      fill('1', password, 'same-pass'),
      fill('2', password, 'same-pass'),
      clickSubmit('3', '/dashboard'),
    ]
    expect(deriveFillVariants(steps)).toEqual([])
  })

  it('ignores fields that are not sensitive', () => {
    const name: IRElement = { ...email, name: 'cityInput', inputType: 'text', locatorValue: 'city' }
    expect(deriveFillVariants([fill('1', name, 'Paris'), fill('2', name, 'Rome')])).toEqual([])
  })
})

describe('withFillVariants', () => {
  it('returns the config untouched when there is nothing to add', () => {
    expect(withFillVariants(undefined, [fill('1', email, 'a@b.co')])).toBeUndefined()
    const config = { params: [] }
    expect(withFillVariants(config, [])).toBe(config)
  })

  it('seeds the sensitive fields and the variant when no config was given', () => {
    const config = withFillVariants(undefined, failedLogin)
    expect(config?.params.map((p) => p.envVarName)).toEqual([
      'RECOSPEC_EMAIL',
      'RECOSPEC_PASSWORD_INVALID',
    ])
  })

  it('drops the base variable a failing flow never reads', () => {
    const base = withFillVariants(undefined, [fill('1', password, 'right'), clickSubmit('2', '/x')])
    expect(base).toBeUndefined()
    const config = withFillVariants(
      {
        params: [
          {
            key: 'passwordInput',
            name: 'password',
            isSecret: true,
            defaultValue: 'change-me',
            useEnvVar: true,
            envVarName: 'RECOSPEC_PASSWORD',
          },
        ],
      },
      failedLogin,
    )
    expect(config?.params.map((p) => p.envVarName)).toEqual(['RECOSPEC_PASSWORD_INVALID'])
  })

  it('never stores a recorded value', () => {
    const config = withFillVariants(undefined, failedLogin)
    expect(JSON.stringify(config)).not.toContain('wrong-pass')
  })
})

describe('fillEnvVarName', () => {
  it('finds the variable for a recorded value', () => {
    const variants = deriveFillVariants(failedLogin)
    expect(fillEnvVarName(variants, password, 'wrong-pass')).toBe('RECOSPEC_PASSWORD_INVALID')
    expect(fillEnvVarName(variants, password, 'other')).toBeUndefined()
    expect(fillEnvVarName(variants, email, 'ada@example.com')).toBeUndefined()
  })
})
