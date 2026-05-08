import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildZipExport } from './zip-export'
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
