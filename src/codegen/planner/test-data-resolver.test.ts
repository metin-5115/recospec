import { describe, it, expect } from 'vitest'
import { resolveTestData, buildDefaultTestDataConfig, testDataKey } from './test-data-resolver'
import type { IRElement, TestDataConfig } from '../ir/types'
import { SECRET_PARAM_DEFAULT_VALUE } from '@shared/constants'

function el(partial: Partial<IRElement>): IRElement {
  return {
    name: 'searchInput',
    locatorStrategy: 'css',
    locatorValue: '#x',
    tagName: 'input',
    ...partial,
  }
}

describe('testDataKey', () => {
  it('uses the IR element name', () => {
    expect(testDataKey(el({ name: 'emailInput' }))).toBe('emailInput')
  })

  it('is undefined without an element', () => {
    expect(testDataKey(undefined)).toBeUndefined()
  })
})

describe('resolveTestData', () => {
  it('keeps a non-sensitive value literal and out of env vars', () => {
    const r = resolveTestData(el({ name: 'searchInput' }), 'blue shoes')
    expect(r.useEnvVar).toBe(false)
    expect(r.isSecret).toBe(false)
    expect(r.literal).toBe('blue shoes')
    expect(r.defaultValue).toBe('blue shoes')
  })

  it('parameterizes a password field through an env var with the safe default', () => {
    const r = resolveTestData(el({ name: 'passwordInput', inputType: 'password' }), 'hunter2')
    expect(r.useEnvVar).toBe(true)
    expect(r.isSecret).toBe(true)
    expect(r.paramName).toBe('password')
    expect(r.envVarName).toBe('RECOSPEC_PASSWORD')
    expect(r.defaultValue).toBe(SECRET_PARAM_DEFAULT_VALUE)
  })

  it('never lets the recorded secret leak into the default value', () => {
    const r = resolveTestData(el({ name: 'pw', inputType: 'password' }), 'hunter2')
    expect(r.defaultValue).not.toContain('hunter2')
  })

  it('lets an explicit override turn the env var off for a sensitive field', () => {
    const config: TestDataConfig = {
      params: [
        {
          key: 'passwordInput',
          name: 'password',
          isSecret: true,
          defaultValue: 'staging-pw',
          useEnvVar: false,
          envVarName: 'RECOSPEC_PASSWORD',
        },
      ],
    }
    const r = resolveTestData(
      el({ name: 'passwordInput', inputType: 'password' }),
      'hunter2',
      config,
    )
    expect(r.useEnvVar).toBe(false)
    expect(r.defaultValue).toBe('staging-pw')
  })

  it('lets an override turn the env var on for a field that is not sensitive', () => {
    const config: TestDataConfig = {
      params: [
        {
          key: 'searchInput',
          name: 'query',
          isSecret: false,
          defaultValue: 'shoes',
          useEnvVar: true,
          envVarName: 'MY_QUERY',
        },
      ],
    }
    const r = resolveTestData(el({ name: 'searchInput' }), 'blue shoes', config)
    expect(r.useEnvVar).toBe(true)
    expect(r.paramName).toBe('query')
    expect(r.envVarName).toBe('MY_QUERY')
    expect(r.defaultValue).toBe('shoes')
  })

  it('ignores an override registered for another element', () => {
    const config: TestDataConfig = {
      params: [
        {
          key: 'otherInput',
          name: 'other',
          isSecret: false,
          defaultValue: 'x',
          useEnvVar: true,
          envVarName: 'OTHER',
        },
      ],
    }
    const r = resolveTestData(el({ name: 'searchInput' }), 'blue shoes', config)
    expect(r.useEnvVar).toBe(false)
  })

  it('handles a missing element', () => {
    const r = resolveTestData(undefined, 'v')
    expect(r.useEnvVar).toBe(false)
    expect(r.paramName).toBe('value')
  })
})

describe('buildDefaultTestDataConfig', () => {
  it('seeds one secret env-var param per sensitive element', () => {
    const cfg = buildDefaultTestDataConfig([
      el({ name: 'passwordInput', inputType: 'password' }),
      el({ name: 'searchInput' }),
    ])
    expect(cfg.params.map((p) => p.key)).toEqual(['passwordInput'])
    expect(cfg.params[0]).toMatchObject({
      isSecret: true,
      useEnvVar: true,
      envVarName: 'RECOSPEC_PASSWORD',
      defaultValue: SECRET_PARAM_DEFAULT_VALUE,
    })
  })

  it('de-duplicates elements that share a name', () => {
    const cfg = buildDefaultTestDataConfig([
      el({ name: 'passwordInput', inputType: 'password' }),
      el({ name: 'passwordInput', inputType: 'password' }),
    ])
    expect(cfg.params).toHaveLength(1)
  })

  it('returns an empty config when nothing is sensitive', () => {
    expect(buildDefaultTestDataConfig([el({ name: 'searchInput' })]).params).toEqual([])
  })
})
