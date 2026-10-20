import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { generateFromActions } from './index'
import { resolveOutputPath } from './export/output-path'
import type { JsonExportPayload } from './export/json-export'
import type { GeneratedFile, FrameworkId } from '@shared/types/generated'
import { RECOSPEC_REPO_URL } from '@shared/constants'
import loginRecording from './__fixtures__/real-login-recording.json'

/**
 * The generated project must READ the credentials the user fills in. The example file the scaffold
 * ships is only useful if the test code (or its config) actually loads the real counterpart.
 */
function generate(framework: FrameworkId): GeneratedFile[] {
  const payload = JSON.parse(JSON.stringify(loginRecording)) as JsonExportPayload
  return generateFromActions(payload.session, payload.actions, framework).files
}

function file(files: GeneratedFile[], name: string): GeneratedFile {
  const found = files.find((f) => f.filename === name)
  if (!found) throw new Error(`${name} not generated: ${files.map((f) => f.filename).join(', ')}`)
  return found
}

function run(command: string, args: string[], cwd: string, env: Record<string, string>): string {
  return execFileSync(command, args, {
    cwd,
    env: { ...process.env, RECOSPEC_PASSWORD: undefined, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  }).trim()
}

function hasJdk(): boolean {
  try {
    execFileSync('javac', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('credential wiring — Playwright', () => {
  const files = generate('playwright-ts')

  it('ships an .env.example the config actually loads', () => {
    expect(files.map((f) => f.filename)).toContain('.env.example')
    const config = file(files, 'playwright.config.ts').content
    expect(config).toMatch(/try\s*\{[\s\S]*process\.loadEnvFile\([\s\S]*\}\s*catch/)
  })

  it('declares the Node version process.loadEnvFile needs', () => {
    const pkg = JSON.parse(file(files, 'package.json').content) as {
      engines?: { node?: string }
    }
    expect(pkg.engines?.node).toBe('>=20.12.0')
  })

  it('makes a value written to .env visible to process.env, and tolerates a missing .env', () => {
    const config = file(files, 'playwright.config.ts').content
    const block = config.match(/try\s*\{[\s\S]*?\}\s*catch\s*\{[\s\S]*?\}/)?.[0]
    expect(block, 'the config has a try/catch env loader').toBeDefined()
    const dir = mkdtempSync(join(tmpdir(), 'recospec-env-'))
    try {
      const probe = `${block}\nprocess.stdout.write(String(process.env.RECOSPEC_PASSWORD))`
      expect(run(process.execPath, ['-e', probe], dir, {})).toBe('undefined')
      writeFileSync(join(dir, '.env'), 'RECOSPEC_PASSWORD=from-dotenv\n')
      expect(run(process.execPath, ['-e', probe], dir, {})).toBe('from-dotenv')
      // A real environment variable still wins over the file.
      expect(run(process.execPath, ['-e', probe], dir, { RECOSPEC_PASSWORD: 'from-shell' })).toBe(
        'from-shell',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps the real .env out of git', () => {
    const ignore = file(files, '.gitignore').content.split('\n')
    expect(ignore).toContain('.env')
    expect(ignore).toContain('node_modules/')
  })
})

describe('credential wiring — Cypress', () => {
  it('keeps cypress.env.json out of git', () => {
    const files = generate('cypress')
    expect(files.map((f) => f.filename)).toContain('cypress.env.json.example')
    expect(file(files, '.gitignore').content.split('\n')).toContain('cypress.env.json')
  })
})

describe('credential wiring — Selenium Java', () => {
  const files = generate('selenium-java')

  it('reads the value through a generated TestData helper instead of System.getenv', () => {
    const javaFiles = files.filter(
      (f) => f.filename.endsWith('Test.java') || f.filename.endsWith('Page.java'),
    )
    const all = javaFiles.map((f) => f.content).join('\n')
    expect(all).toContain('TestData.get("RECOSPEC_PASSWORD", "change-me")')
    expect(all).not.toMatch(/getenv\(\)\.getOrDefault\("RECOSPEC_/)
    for (const f of javaFiles) {
      if (f.content.includes('TestData.get(')) {
        expect(f.content).toContain('import support.TestData;')
      }
    }
  })

  it('ships the example file and ignores the real one', () => {
    expect(files.map((f) => f.filename)).toContain(
      'src/test/resources/test-data.properties.example',
    )
    expect(file(files, '.gitignore').content.split('\n')).toContain(
      'src/test/resources/test-data.properties',
    )
  })

  it.skipIf(!hasJdk())('resolves env first, then test-data.properties, then the default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recospec-java-'))
    try {
      const source = join(dir, 'src/main/java/support/TestData.java')
      mkdirSync(dirname(source), { recursive: true })
      writeFileSync(source, file(files, 'src/main/java/support/TestData.java').content)
      const main = join(dir, 'Probe.java')
      writeFileSync(
        main,
        'public class Probe { public static void main(String[] a) { System.out.print(support.TestData.get("RECOSPEC_PASSWORD", "change-me")); } }',
      )
      const out = join(dir, 'out')
      mkdirSync(out)
      run('javac', ['-d', out, source, main], dir, {})
      const props = join(dir, 'res')
      mkdirSync(props)
      const probe = (env: Record<string, string>): string =>
        run('java', ['-cp', `${out}${delimiter}${props}`, 'Probe'], dir, env)
      expect(probe({})).toBe('change-me')
      writeFileSync(join(props, 'test-data.properties'), 'RECOSPEC_PASSWORD=from-properties\n')
      expect(probe({})).toBe('from-properties')
      expect(probe({ RECOSPEC_PASSWORD: 'from-env' })).toBe('from-env')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('lands in the Maven main source root', () => {
    expect(resolveOutputPath('src/main/java/support/TestData.java', 'selenium-java')).toBe(
      'src/main/java/support/TestData.java',
    )
  })
})

describe('credential wiring — unchanged references', () => {
  it('Selenium Python still loads .env with python-dotenv', () => {
    const files = generate('selenium-py')
    expect(file(files, 'conftest.py').content).toContain('load_dotenv()')
  })

  it('the repository link is one shared constant pointing at the real repo', () => {
    expect(RECOSPEC_REPO_URL).toBe('https://github.com/metin-5115/recospec')
  })
})
