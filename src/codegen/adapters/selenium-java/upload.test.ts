import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { renderScaffold } from './scaffold'
import { validateJavaSource } from './java-validate'
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

function expectBalanced(source: string): void {
  const result = validateJavaSource(source)
  expect(result.ok, JSON.stringify(result.issues)).toBe(true)
}

describe('selenium-java adapter — file upload', () => {
  it('sends the absolute fixture path with sendKeys', () => {
    const out = renderPageObject(pageWith([uploadStep(['me.png'])]))
    expect(out).toContain('public void uploadAvatar()')
    expect(out).toContain(
      `this.avatarInput.sendKeys(java.nio.file.Paths.get("fixtures/me.png").toAbsolutePath().toString());`,
    )
    expect(out).not.toContain('.clear()')
    expectBalanced(out)
  })

  it('joins several files with newlines in one sendKeys call', () => {
    const out = renderPageObject(pageWith([uploadStep(['a.pdf', 'b.pdf'], true)]))
    expect(out).toContain(
      `String.join("\\n", java.nio.file.Paths.get("fixtures/a.pdf").toAbsolutePath().toString(), java.nio.file.Paths.get("fixtures/b.pdf").toAbsolutePath().toString())`,
    )
    expectBalanced(out)
  })

  it('calls the upload method from the test', () => {
    const scenario: IRScenario = {
      name: 'Profile flow',
      pages: [pageWith([uploadStep(['me.png'])])],
    }
    const spec = renderScenario(scenario)
    expect(spec).toContain('profilePage.uploadAvatar();')
    expectBalanced(spec)
  })

  it('renders the upload inline for a page with no inferred methods', () => {
    const scenario: IRScenario = {
      name: 'Profile flow',
      pages: [pageWith([uploadStep(['me.png'])], false)],
    }
    const spec = renderScenario(scenario)
    expect(spec).toContain(`.sendKeys(java.nio.file.Paths.get("fixtures/me.png")`)
    expectBalanced(spec)
  })

  it('adds a fixtures folder to the scaffold only when the flow uploads files', () => {
    expect(renderScaffold({ hasUploads: true }).map((f) => f.filename)).toContain(
      'fixtures/.gitkeep',
    )
    expect(renderScaffold({}).map((f) => f.filename)).not.toContain('fixtures/.gitkeep')
  })
})
