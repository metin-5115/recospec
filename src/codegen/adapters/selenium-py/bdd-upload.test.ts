import { describe, it, expect } from 'vitest'
import { renderFeatureFile, renderStepsFile } from './bdd'
import { validatePythonSource } from './python-validate'
import type { IRElement, IRPage, IRScenario } from '../../ir/types'

const avatar: IRElement = {
  name: 'avatarInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="avatar"]',
  tagName: 'input',
  inputType: 'file',
}

const profilePage: IRPage = {
  name: 'Profile',
  className: 'ProfilePage',
  normalizedUrl: '/profile',
  elements: [avatar],
  steps: [
    { id: 's0', action: 'navigate', url: '/profile' },
    {
      id: 's1',
      action: 'upload',
      element: avatar,
      upload: { fileNames: ['a.pdf', 'b.pdf'], multiple: true },
    },
  ],
}

const scenario: IRScenario = { name: 'User uploads files', pages: [profilePage] }

describe('selenium-py BDD — file upload', { timeout: 30_000 }, () => {
  it('writes the upload as a Gherkin step', () => {
    expect(renderFeatureFile(scenario)).toContain('I upload "a.pdf, b.pdf" to the "avatar" field')
  })

  it('registers a valid step definition that sends the fixture paths', () => {
    const steps = renderStepsFile(scenario)
    expect(steps).toContain('I upload')
    expect(steps).toContain('.send_keys(')
    expect(steps).toContain("os.path.join('fixtures'")
    expect(steps).toMatch(/^import os$/m)
    expect(steps).not.toContain('NotImplementedError')
    const result = validatePythonSource(steps)
    expect(result.ok, result.error).toBe(true)
  })
})
