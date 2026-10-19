import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { renderScaffold } from './index'
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

describe('cypress adapter — file upload', () => {
  it('renders selectFile with a fixtures placeholder path in the page object', () => {
    const out = renderPageObject(pageWith([uploadStep(['me.png'])]))
    expect(out).toContain('uploadAvatar()')
    expect(out).toContain(`this.avatarInput().selectFile("fixtures/me.png");`)
    expect(out).not.toContain('.type(')
  })

  it('passes an array for several files', () => {
    const out = renderPageObject(pageWith([uploadStep(['a.pdf', 'b.pdf'], true)]))
    expect(out).toContain(`.selectFile(["fixtures/a.pdf", "fixtures/b.pdf"]);`)
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
    expect(renderScenario(scenario)).toContain(`.selectFile("fixtures/me.png");`)
  })

  it('adds a fixtures folder to the scaffold only when the flow uploads files', () => {
    expect(renderScaffold({ hasUploads: true }).map((f) => f.filename)).toContain(
      'fixtures/.gitkeep',
    )
    expect(renderScaffold({}).map((f) => f.filename)).not.toContain('fixtures/.gitkeep')
  })
})
