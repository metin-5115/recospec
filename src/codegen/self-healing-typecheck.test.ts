import { describe, it, expect } from 'vitest'
import { normalizeActions } from './normalizer/action-normalizer'
import { groupIntoPages } from './planner/page-grouper'
import { getAdapter } from './adapters/registry'
import './adapters/playwright-ts'
import './adapters/cypress'
import { typeErrors } from './ts-typecheck.test-util'
import { syntaxErrors } from './ts-syntax.test-util'
import { resolveOutputPath } from './export/output-path'
import type { JsonExportPayload } from './export/json-export'
import type { FrameworkId, GeneratedFile } from '@shared/types/generated'
import checkoutRecording from './__fixtures__/real-checkout-recording.json'

const TYPECHECK_TIMEOUT_MS = 60_000

function render(framework: FrameworkId): GeneratedFile[] {
  const payload = JSON.parse(JSON.stringify(checkoutRecording)) as JsonExportPayload
  const pages = groupIntoPages(
    normalizeActions(payload.actions).flatSteps,
    payload.session.startUrl,
  )
  const adapter = getAdapter(framework)
  const options = { selfHealing: true }
  return [
    ...pages.map((page) => adapter.renderPageObject(page, options)),
    adapter.renderScenario(
      { name: payload.session.name, startUrl: payload.session.startUrl, pages },
      options,
    ),
    ...adapter.renderScaffold(options),
  ]
}

describe('a real recording rendered with runtime self-healing', () => {
  it(
    'Playwright output, together with its helper, type-checks against @playwright/test',
    () => {
      const files = render('playwright-ts')
      const code = files.map((f) => f.content).join('\n')
      expect(code).toContain('selfHealingLocator(this.page, [')

      const layout = Object.fromEntries(
        files
          .filter((f) => f.filename.endsWith('.ts'))
          .map((f) => [resolveOutputPath(f.filename, 'playwright-ts'), f.content]),
      )
      expect(Object.keys(layout)).toContain('utils/locator.ts')
      expect(typeErrors(layout)).toEqual([])
    },
    TYPECHECK_TIMEOUT_MS,
  )

  it('Cypress output and its support command parse', () => {
    const files = render('cypress')
    const code = files.map((f) => f.content).join('\n')
    expect(code).toContain('cy.selfHealing([')
    for (const f of files.filter((x) => x.filename.endsWith('.js'))) {
      expect(syntaxErrors(f.content, f.filename)).toEqual([])
    }
  })
})
