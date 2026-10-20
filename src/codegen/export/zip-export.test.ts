import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildZipExport } from './zip-export'
import { RECOSPEC_REPO_URL } from '@shared/constants'
import type { Session } from '@shared/types/session'
import type { GeneratedCode } from '@shared/types/generated'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'test-session-id',
    name: 'My Test Session',
    state: 'stopped',
    startUrl: 'https://example.com',
    startedAt: 1000000,
    metadata: {
      userAgent: 'test-agent',
      viewport: { width: 1280, height: 800 },
      timezone: 'UTC',
    },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'test-sig',
    ...overrides,
  }
}

function makeCode(files: { filename: string; content: string }[]): GeneratedCode {
  return { framework: 'playwright-ts', files }
}

async function listZipPaths(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return Object.keys(zip.files).sort()
}

async function readZipFile(blob: Blob, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const file = zip.file(path)
  if (!file) throw new Error(`File not found in ZIP: ${path}`)
  return file.async('string')
}

describe('buildZipExport', () => {
  it('places spec files in tests/ folder', async () => {
    const code = makeCode([{ filename: 'scenario.spec.ts', content: 'test content' }])
    const blob = await buildZipExport(makeSession(), code)
    const paths = await listZipPaths(blob)
    expect(paths).toContain('tests/scenario.spec.ts')
  })

  it('places page object files in pages/ folder', async () => {
    const code = makeCode([{ filename: 'HomePage.ts', content: 'class HomePage {}' }])
    const blob = await buildZipExport(makeSession(), code)
    const paths = await listZipPaths(blob)
    expect(paths).toContain('pages/HomePage.ts')
  })

  it('places scaffold files at root', async () => {
    const code = makeCode([
      { filename: 'package.json', content: '{}' },
      { filename: 'playwright.config.ts', content: 'export default {}' },
      { filename: 'tsconfig.json', content: '{}' },
    ])
    const blob = await buildZipExport(makeSession(), code)
    const paths = await listZipPaths(blob)
    expect(paths).toContain('package.json')
    expect(paths).toContain('playwright.config.ts')
    expect(paths).toContain('tsconfig.json')
  })

  it('documents how to override the base URL and where the flow snapshots live', async () => {
    const session = makeSession({
      name: 'Checkout flow',
      startUrl: 'https://shop.example.com/cart',
    })
    const blob = await buildZipExport(session, makeCode([]))
    const readme = await readZipFile(blob, 'README.md')
    expect(readme).toContain('(https://shop.example.com)')
    expect(readme).toContain('BASE_URL=https://staging.example.com npx playwright test')
    expect(readme).toContain('tests/checkout-flow.spec.ts-snapshots/')
    expect(readme).not.toContain('scenario.spec.ts')
  })

  it('always includes README.md at root', async () => {
    const blob = await buildZipExport(makeSession(), makeCode([]))
    const paths = await listZipPaths(blob)
    expect(paths).toContain('README.md')
  })

  it('README.md contains the session name', async () => {
    const session = makeSession({ name: 'Login Flow' })
    const blob = await buildZipExport(session, makeCode([]))
    const readme = await readZipFile(blob, 'README.md')
    expect(readme).toContain('Login Flow')
  })

  it('README.md contains the start URL', async () => {
    const session = makeSession({ startUrl: 'https://my-app.dev' })
    const blob = await buildZipExport(session, makeCode([]))
    const readme = await readZipFile(blob, 'README.md')
    expect(readme).toContain('https://my-app.dev')
  })

  it('file contents are preserved verbatim', async () => {
    const content = 'export class LoginPage { async goto() {} }'
    const code = makeCode([{ filename: 'LoginPage.ts', content }])
    const blob = await buildZipExport(makeSession(), code)
    const actual = await readZipFile(blob, 'pages/LoginPage.ts')
    expect(actual).toBe(content)
  })

  it('README.md mentions visual regression instructions', async () => {
    const blob = await buildZipExport(makeSession(), makeCode([]))
    const readme = await readZipFile(blob, 'README.md')
    expect(readme).toContain('Visual regression')
    expect(readme).toContain('toHaveScreenshot')
  })

  it('places cypress BDD .feature file at cypress/e2e/', async () => {
    const code: GeneratedCode = {
      framework: 'cypress',
      files: [{ filename: 'scenario.feature', content: 'Feature: x' }],
    }
    const blob = await buildZipExport(makeSession(), code)
    const paths = await listZipPaths(blob)
    expect(paths).toContain('cypress/e2e/scenario.feature')
  })

  it('places cypress BDD .steps.js inside a folder matching the feature basename', async () => {
    const code: GeneratedCode = {
      framework: 'cypress',
      files: [{ filename: 'scenario.steps.js', content: '// step defs' }],
    }
    const blob = await buildZipExport(makeSession(), code)
    const paths = await listZipPaths(blob)
    // cypress-cucumber-preprocessor convention: feature/<name>.feature is
    // paired with the same-named folder for step definitions.
    expect(paths).toContain('cypress/e2e/scenario/scenario.steps.js')
  })

  it('still routes cypress page-object .js files to cypress/pages/', async () => {
    const code: GeneratedCode = {
      framework: 'cypress',
      files: [{ filename: 'LoginPage.js', content: 'export class LoginPage {}' }],
    }
    const blob = await buildZipExport(makeSession(), code)
    const paths = await listZipPaths(blob)
    expect(paths).toContain('cypress/pages/LoginPage.js')
  })

  it('still routes Playwright BDD .feature files to features/', async () => {
    const code: GeneratedCode = {
      framework: 'playwright-ts',
      files: [{ filename: 'scenario.feature', content: 'Feature: x' }],
    }
    const blob = await buildZipExport(makeSession(), code)
    const paths = await listZipPaths(blob)
    expect(paths).toContain('features/scenario.feature')
  })

  it('handles a full set of generated files correctly', async () => {
    const code = makeCode([
      { filename: 'HomePage.ts', content: 'class HomePage {}' },
      { filename: 'LoginPage.ts', content: 'class LoginPage {}' },
      { filename: 'scenario.spec.ts', content: 'test("...", async () => {})' },
      { filename: 'package.json', content: '{"name":"test"}' },
      { filename: 'playwright.config.ts', content: 'export default {}' },
      { filename: 'tsconfig.json', content: '{}' },
    ])
    const blob = await buildZipExport(makeSession(), code)
    const paths = await listZipPaths(blob)

    expect(paths).toContain('pages/HomePage.ts')
    expect(paths).toContain('pages/LoginPage.ts')
    expect(paths).toContain('tests/scenario.spec.ts')
    expect(paths).toContain('package.json')
    expect(paths).toContain('playwright.config.ts')
    expect(paths).toContain('tsconfig.json')
    expect(paths).toContain('README.md')
  })
})

describe('buildZipExport — upload fixtures', () => {
  it('explains the fixtures folder when the flow uploads files', async () => {
    const code = makeCode([{ filename: 'fixtures/.gitkeep', content: '' }])
    const blob = await buildZipExport(makeSession(), code)
    expect(await listZipPaths(blob)).toContain('fixtures/.gitkeep')
    const readme = await readZipFile(blob, 'README.md')
    expect(readme).toContain('## Upload fixtures')
    expect(readme).toContain('`fixtures/`')
  })

  it('leaves the fixtures section out when nothing is uploaded', async () => {
    const blob = await buildZipExport(makeSession(), makeCode([]))
    const readme = await readZipFile(blob, 'README.md')
    expect(readme).not.toContain('Upload fixtures')
  })
})

describe('buildZipExport — fallback locator wording', () => {
  async function readmeFor(framework: GeneratedCode['framework']): Promise<string> {
    const blob = await buildZipExport(makeSession(), { framework, files: [] })
    return readZipFile(blob, 'README.md')
  }

  it('calls the Selenium fallbacks suggestions, not self-healing', async () => {
    for (const framework of ['selenium-py', 'selenium-java'] as const) {
      const readme = await readmeFor(framework)
      expect(readme).toContain('## Fallback locator suggestions')
      expect(readme).not.toContain('## Self-healing locators')
    }
  })

  it('describes the run-time helpers for Playwright and Cypress', async () => {
    const playwright = await readmeFor('playwright-ts')
    expect(playwright).toContain('## Self-healing locators')
    expect(playwright).toContain('selfHealingLocator(this.page, [primary, ...fallbacks])')
    expect((await readmeFor('cypress')).toLowerCase()).toContain('cy.selfhealing')
  })
})

describe('buildZipExport — test data section', () => {
  async function readmeFor(framework: GeneratedCode['framework'], example?: string) {
    const files = example ? [{ filename: example, content: 'RECOSPEC_PASSWORD=\n' }] : []
    const blob = await buildZipExport(makeSession(), { framework, files })
    return readZipFile(blob, 'README.md')
  }

  it('tells each framework which example file to copy and how to run', async () => {
    const playwright = await readmeFor('playwright-ts', '.env.example')
    expect(playwright).toContain('## Test data')
    expect(playwright).toContain('cp .env.example .env')
    expect(playwright).toContain('Node 20.12')

    const cypress = await readmeFor('cypress', 'cypress.env.json.example')
    expect(cypress).toContain('cp cypress.env.json.example cypress.env.json')

    const python = await readmeFor('selenium-py', '.env.example')
    expect(python).toContain('cp .env.example .env')

    const java = await readmeFor('selenium-java', 'src/test/resources/test-data.properties.example')
    expect(java).toContain(
      'cp src/test/resources/test-data.properties.example src/test/resources/test-data.properties',
    )
    expect(java).toContain('mvn test')
  })

  it('leaves the section out when the recording had no test data', async () => {
    expect(await readmeFor('playwright-ts')).not.toContain('## Test data')
  })

  it('links back to the real repository, not a placeholder', async () => {
    const readme = await readmeFor('playwright-ts')
    expect(readme).toContain(`[Recospec](${RECOSPEC_REPO_URL})`)
    expect(readme).not.toContain('your-username')
  })
})
