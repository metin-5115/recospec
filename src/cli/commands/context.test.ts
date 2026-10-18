import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runContext, type ContextCmdOptions } from './context'

const FIXTURE = resolve(process.cwd(), 'src/codegen/__fixtures__/real-login-recording.json')

describe('runContext', () => {
  let projectDir: string
  let stdout: MockInstance<typeof process.stdout.write>
  let stderr: MockInstance<typeof console.error>

  const options = (overrides: Partial<ContextCmdOptions> = {}): ContextCmdOptions => ({
    json: FIXTURE,
    projectDir,
    format: 'compact',
    task: 'both',
    framework: 'playwright-ts',
    ...overrides,
  })

  const stdoutText = (): string => stdout.mock.calls.map((call) => String(call[0])).join('')

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'recospec-context-'))
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('dry-run prints only the document to stdout and writes nothing', async () => {
    await runContext(options({ dryRun: true }))
    expect(stdoutText().startsWith('#recospec-ctx v1')).toBe(true)
    expect(existsSync(join(projectDir, '.recospec'))).toBe(false)
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('tokens'))).toBe(true)
  })

  it('writes the compact context under .recospec/context by default', async () => {
    await runContext(options())
    const file = join(projectDir, '.recospec', 'context', 'login-flow.llm.txt')
    expect(readFileSync(file, 'utf8')).toContain('@steps')
  })

  it('writes JSON with the .llm.json extension', async () => {
    await runContext(options({ format: 'json' }))
    const file = join(projectDir, '.recospec', 'context', 'login-flow.llm.json')
    expect(() => JSON.parse(readFileSync(file, 'utf8'))).not.toThrow()
  })

  it('omits rules and the task line with noInstructions', async () => {
    await runContext(options({ dryRun: true, noInstructions: true }))
    expect(stdoutText()).not.toContain('@rules')
    expect(stdoutText()).not.toContain('@task')
  })

  it('overwrites an existing file when forced', async () => {
    const output = join(projectDir, 'ctx.txt')
    writeFileSync(output, 'old', 'utf8')
    await runContext(options({ output, force: true }))
    expect(readFileSync(output, 'utf8')).toContain('#recospec-ctx')
  })

  it('rejects an unsupported export version', async () => {
    const bad = join(projectDir, 'bad.json')
    writeFileSync(bad, JSON.stringify({ formatVersion: 99 }), 'utf8')
    await expect(runContext(options({ json: bad }))).rejects.toThrow(/formatVersion/)
  })
})
