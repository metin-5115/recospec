import { describe, it, expect } from 'vitest'
import { renderPageObject, renderScenario } from './index'
import { renderScaffold } from './scaffold'
import { inferMethods } from '../../planner/method-inferer'
import type { IRElement, IRPage, IRScenario, IRStep } from '../../ir/types'

const avatar: IRElement = {
  name: 'avatarInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="avatarInput"]',
  tagName: 'input',
  inputType: 'file',
}

function uploadStep(fileNames: string[], multiple = false): IRStep {
  return { id: 'u1', action: 'upload', element: avatar, upload: { fileNames, multiple } }
}

function pageWith(steps: IRStep[], withMethods = true): IRPage {
  return {
    name: 'Profile',
    className: 'ProfilePage',
    normalizedUrl: '/profile',
    elements: [avatar],
    steps: [{ id: 'nav', action: 'navigate', url: '/profile' }, ...steps],
    inferredMethods: withMethods ? inferMethods(steps) : undefined,
  }
}

describe('playwright adapter — file upload', () => {
  it('renders setInputFiles with a fixtures placeholder path in the page object', () => {
    const out = renderPageObject(pageWith([uploadStep(['me.png'])]))
    expect(out).toContain('async uploadAvatar()')
    expect(out).toContain(`await this.avatarInput.setInputFiles("fixtures/me.png");`)
    expect(out).not.toContain('.fill(')
  })

  it('passes an array for several files', () => {
    const out = renderPageObject(pageWith([uploadStep(['a.pdf', 'b.pdf'], true)]))
    expect(out).toContain(`setInputFiles(["fixtures/a.pdf", "fixtures/b.pdf"])`)
  })

  it('passes an array for a lone file on a multiple input', () => {
    const out = renderPageObject(pageWith([uploadStep(['a.pdf'], true)]))
    expect(out).toContain(`setInputFiles(["fixtures/a.pdf"])`)
  })

  it('calls the upload method from the spec', () => {
    const scenario: IRScenario = {
      name: 'Profile flow',
      pages: [pageWith([uploadStep(['me.png'])])],
    }
    expect(renderScenario(scenario)).toContain('profilePage.uploadAvatar();')
  })

  it('renders the upload inline for a page with no inferred methods', () => {
    const scenario: IRScenario = {
      name: 'Profile flow',
      pages: [pageWith([uploadStep(['me.png'])], false)],
    }
    expect(renderScenario(scenario)).toContain(`.setInputFiles("fixtures/me.png");`)
  })

  it('adds a fixtures folder to the scaffold only when the flow uploads files', () => {
    expect(renderScaffold({ hasUploads: true }).map((f) => f.filename)).toContain(
      'fixtures/.gitkeep',
    )
    expect(renderScaffold({}).map((f) => f.filename)).not.toContain('fixtures/.gitkeep')
  })
})
