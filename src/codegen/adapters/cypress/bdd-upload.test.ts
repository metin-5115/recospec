import { describe, it, expect } from 'vitest'
import { renderFeatureFile, renderStepsFile } from './bdd'
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

describe('cypress BDD — file upload', () => {
  it('writes the upload as a Gherkin step', () => {
    expect(renderFeatureFile(scenario)).toContain('I upload "a.pdf, b.pdf" to the "avatar" field')
  })

  it('registers a step definition that selects the fixture files', () => {
    const steps = renderStepsFile(scenario)
    expect(steps).toContain('I upload {string} to the {string} field')
    expect(steps).toContain('cy.findByLabelText(arg2).selectFile(')
    expect(steps).toContain('fixtures/')
    expect(steps).not.toContain('Unsupported recorded step')
  })
})
