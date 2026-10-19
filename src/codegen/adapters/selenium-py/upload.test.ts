import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { renderScaffold } from './scaffold'
import { validatePythonSource } from './python-validate'
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

function expectValidPython(source: string): void {
  // With no interpreter on PATH the validator reports ok + skipped (CI-safe).
  const result = validatePythonSource(source)
  expect(result.ok, result.error).toBe(true)
}

describe('selenium-py adapter — file upload', { timeout: 30_000 }, () => {
  it('sends the fixture path with send_keys and imports os', () => {
    const out = renderPageObject(pageWith([uploadStep(['me.png'])]))
    expect(out).toContain('def upload_avatar(self):')
    expect(out).toContain(`.send_keys(os.path.abspath('fixtures/me.png'))`)
    expect(out).toMatch(/^import os$/m)
    expect(out).not.toContain('.clear()')
    expectValidPython(out)
  })

  it('joins several files with newlines in one send_keys call', () => {
    const out = renderPageObject(pageWith([uploadStep(['a.pdf', 'b.pdf'], true)]))
    expect(out).toContain(
      `.send_keys('\\n'.join([os.path.abspath('fixtures/a.pdf'), os.path.abspath('fixtures/b.pdf')]))`,
    )
    expectValidPython(out)
  })

  it('does not import os when nothing uploads', () => {
    const out = renderPageObject(pageWith([{ id: 'c1', action: 'click', element: avatar }]))
    expect(out).not.toMatch(/^import os$/m)
  })

  it('calls the upload method from the test', () => {
    const scenario: IRScenario = {
      name: 'Profile flow',
      pages: [pageWith([uploadStep(['me.png'])])],
    }
    const spec = renderScenario(scenario)
    expect(spec).toContain('profile_page.upload_avatar()')
    expectValidPython(spec)
  })

  it('renders the upload inline for a page with no inferred methods', () => {
    const scenario: IRScenario = {
      name: 'Profile flow',
      pages: [pageWith([uploadStep(['me.png'])], false)],
    }
    const spec = renderScenario(scenario)
    expect(spec).toContain(`.send_keys(os.path.abspath('fixtures/me.png'))`)
    expect(spec).toMatch(/^import os$/m)
    expectValidPython(spec)
  })

  it('adds a fixtures folder to the scaffold only when the flow uploads files', () => {
    expect(renderScaffold({ hasUploads: true }).map((f) => f.filename)).toContain(
      'fixtures/.gitkeep',
    )
    expect(renderScaffold({}).map((f) => f.filename)).not.toContain('fixtures/.gitkeep')
  })
})
