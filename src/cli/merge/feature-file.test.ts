import { describe, it, expect } from 'vitest'
import { mergeFeatureFile } from './feature-file'

const EXISTING = `Feature: Authentication

  Scenario: User can log in
    Given I am on the "/login" page
    When I log in with email "a@b.com" and password "secret"
    Then I should see the dashboard
`

const INCOMING = `Feature: Authentication

  Scenario: User can log in
    Given I am on the "/login" page
    When I log in with email "different@x.com" and password "x"
    Then I should see the dashboard

  Scenario: User can sign up
    Given I am on the "/signup" page
    When I submit the signup form
    Then I should be redirected to the welcome page
`

describe('mergeFeatureFile', () => {
  it('appends new scenarios and skips duplicates by title (case-insensitive)', () => {
    const result = mergeFeatureFile(EXISTING, INCOMING)
    expect(result.added).toEqual(['User can sign up'])
    expect(result.skipped).toEqual(['User can log in'])
  })

  it('never duplicates the Feature: header', () => {
    const result = mergeFeatureFile(EXISTING, INCOMING)
    const featureCount = (result.source.match(/^Feature:/gm) ?? []).length
    expect(featureCount).toBe(1)
  })

  it('preserves the original scenario body (we are append-only)', () => {
    const result = mergeFeatureFile(EXISTING, INCOMING)
    expect(result.source).toContain('email "a@b.com"')
    expect(result.source).not.toContain('email "different@x.com"')
  })

  it('produces output that is still valid Gherkin (re-parseable)', () => {
    // Re-merging should be a no-op.
    const first = mergeFeatureFile(EXISTING, INCOMING)
    const second = mergeFeatureFile(first.source, INCOMING)
    expect(second.added).toEqual([])
  })
})
