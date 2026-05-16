import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import prompts from 'prompts'
import { runPrompt } from './prompt'
import type { JsonExportPayload } from '@codegen/export/json-export'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'

// ---------------------------------------------------------------------------
// Fixture helpers (slimmed copies of prompt-export.test.ts builders)
// ---------------------------------------------------------------------------

const FIXED_EXPORTED_AT = 1_715_000_000_000

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    name: 'Login Flow',
    state: 'stopped',
    startUrl: 'https://example.com/login',
    startedAt: FIXED_EXPORTED_AT - 60_000,
    stoppedAt: FIXED_EXPORTED_AT - 1_000,
    metadata: {
      userAgent: 'test-agent',
      viewport: { width: 1280, height: 800 },
      timezone: 'UTC',
    },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'sig-1',
    ...overrides,
  }
}

function makeAction(
  partial: Partial<RecordedAction> & Pick<RecordedAction, 'type'>,
  idx: number,
): RecordedAction {
  return {
    actionId: `action-${idx}`,
    sessionId: 'session-1',
    sequenceNumber: idx,
    timestamp: FIXED_EXPORTED_AT - 60_000 + idx * 100,
    pageUrl: 'https://example.com/login',
    ...partial,
  }
}

function fillAction(
  idx: number,
  ariaLabel: string,
  value: string,
  extraAttrs: Record<string, string> = {},
): RecordedAction {
  const attributes: Record<string, string> = {
    type: 'text',
    name: ariaLabel.toLowerCase(),
    ...extraAttrs,
    'aria-label': ariaLabel,
  }
  return makeAction(
    {
      type: 'fill',
      target: {
        primaryLocator: {
          strategy: 'aria-label',
          selector: `[aria-label="${ariaLabel}"]`,
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'input', attributes, textContent: '' },
      },
      payload: { value },
    },
    idx,
  )
}

function clickAction(idx: number, ariaLabel: string): RecordedAction {
  return makeAction(
    {
      type: 'click',
      target: {
        primaryLocator: {
          strategy: 'aria-label',
          selector: `[aria-label="${ariaLabel}"]`,
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: {
          tagName: 'button',
          attributes: { type: 'submit', 'aria-label': ariaLabel },
          textContent: ariaLabel,
        },
      },
    },
    idx,
  )
}

const LOGIN_ACTIONS: RecordedAction[] = [
  fillAction(0, 'Email', 'alice@example.com', { type: 'email' }),
  fillAction(1, 'Password', 'supersecret123', { type: 'password' }),
  clickAction(2, 'Sign In'),
]

function makePayload(): JsonExportPayload {
  return {
    exportedAt: FIXED_EXPORTED_AT,
    formatVersion: 1,
    session: makeSession(),
    actions: LOGIN_ACTIONS,
  }
}

// ---------------------------------------------------------------------------
// Suite scaffolding
// ---------------------------------------------------------------------------

let tmp: string
let jsonPath: string
let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'playforge-prompt-'))
  jsonPath = join(tmp, 'session.json')
  writeFileSync(jsonPath, JSON.stringify(makePayload()), 'utf8')
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
  logSpy.mockRestore()
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runPrompt — slash mode', () => {
  it('writes .claude/commands/playforge-<slug>.md with YAML frontmatter', async () => {
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'slash',
      framework: 'playwright-ts',
    })
    const outPath = join(tmp, '.claude', 'commands', 'playforge-login-flow.md')
    expect(existsSync(outPath)).toBe(true)
    const md = readFileSync(outPath, 'utf8')
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('description: PlayForge recorded flow — login-flow')
    expect(md).toContain('allowed-tools:')
    expect(md).toContain('framework: playwright-ts')
    // Sensitive value redacted by default.
    expect(md).not.toContain('supersecret123')
    expect(md).toContain('<REDACTED:PLAYFORGE_PASSWORD>')
  })

  it('honours -n / slug override for the output filename', async () => {
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'slash',
      slug: 'auth-happy-path',
    })
    expect(existsSync(join(tmp, '.claude', 'commands', 'playforge-auth-happy-path.md'))).toBe(true)
  })
})

describe('runPrompt — prompt mode', () => {
  it('writes prompts/<slug>.md and mkdir -p the parent directory', async () => {
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'prompt',
    })
    const outPath = join(tmp, 'prompts', 'login-flow.md')
    expect(existsSync(outPath)).toBe(true)
    const md = readFileSync(outPath, 'utf8')
    expect(md.startsWith('---\n')).toBe(false) // no frontmatter in prompt mode
    expect(md).toContain('## Scenario summary')
  })
})

describe('runPrompt — claude-md mode', () => {
  it('appends a BEGIN/END block to a fresh CLAUDE.md', async () => {
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'claude-md',
    })
    const md = readFileSync(join(tmp, 'CLAUDE.md'), 'utf8')
    expect(md).toContain('<!-- BEGIN playforge:login-flow -->')
    expect(md).toContain('<!-- END playforge:login-flow -->')
    // No frontmatter — claude-md uses marker comments instead.
    expect(md.startsWith('---\n')).toBe(false)
  })

  it('preserves prior CLAUDE.md content and only appends the new block', async () => {
    const claudeMdPath = join(tmp, 'CLAUDE.md')
    writeFileSync(claudeMdPath, '# My Project\n\nPre-existing rules go here.\n', 'utf8')
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'claude-md',
    })
    const md = readFileSync(claudeMdPath, 'utf8')
    expect(md).toContain('# My Project')
    expect(md).toContain('Pre-existing rules go here.')
    expect(md).toContain('<!-- BEGIN playforge:login-flow -->')
    // Order: existing content first, then our block.
    expect(md.indexOf('# My Project')).toBeLessThan(
      md.indexOf('<!-- BEGIN playforge:login-flow -->'),
    )
  })

  it('replaces the existing playforge block in place (idempotent)', async () => {
    const claudeMdPath = join(tmp, 'CLAUDE.md')

    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'claude-md',
    })
    const firstPass = readFileSync(claudeMdPath, 'utf8')

    // Mutate the session to verify the block actually gets replaced.
    const payload = makePayload()
    payload.session.startUrl = 'https://example.com/login-v2'
    writeFileSync(jsonPath, JSON.stringify(payload), 'utf8')

    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'claude-md',
    })
    const secondPass = readFileSync(claudeMdPath, 'utf8')

    // Only one block — no duplicate markers.
    const beginCount = (secondPass.match(/<!-- BEGIN playforge:login-flow -->/g) ?? []).length
    expect(beginCount).toBe(1)
    expect(secondPass).toContain('https://example.com/login-v2')
    expect(secondPass).not.toContain('https://example.com/login\n')
    expect(secondPass).not.toEqual(firstPass)
  })

  it('does not prompt on conflict — claude-md is a structural upsert', async () => {
    const claudeMdPath = join(tmp, 'CLAUDE.md')
    writeFileSync(claudeMdPath, 'irrelevant\n', 'utf8')
    // No prompts.inject — if the code tried to prompt, vitest would hang.
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'claude-md',
    })
    const md = readFileSync(claudeMdPath, 'utf8')
    expect(md).toContain('irrelevant')
    expect(md).toContain('<!-- BEGIN playforge:login-flow -->')
  })
})

describe('runPrompt — conflict handling for slash/prompt modes', () => {
  it('skips the existing file when the user picks skip', async () => {
    // First write — creates the file.
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'slash',
    })
    const outPath = join(tmp, '.claude', 'commands', 'playforge-login-flow.md')
    const before = readFileSync(outPath, 'utf8')

    // Tamper with the file so we can detect whether it was overwritten.
    writeFileSync(outPath, 'USER MODIFIED CONTENT\n', 'utf8')

    prompts.inject(['skip'])
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'slash',
    })
    expect(readFileSync(outPath, 'utf8')).toBe('USER MODIFIED CONTENT\n')
    // Sanity: the original render wasn't accidentally re-written.
    expect(before).not.toBe('USER MODIFIED CONTENT\n')
  })

  it('overwrites with --force without prompting', async () => {
    const outPath = join(tmp, '.claude', 'commands', 'playforge-login-flow.md')
    await runPrompt({ json: jsonPath, projectDir: tmp, mode: 'slash' })
    writeFileSync(outPath, 'USER MODIFIED CONTENT\n', 'utf8')

    // No prompts.inject — --force must bypass.
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'slash',
      force: true,
    })
    const md = readFileSync(outPath, 'utf8')
    expect(md).not.toContain('USER MODIFIED CONTENT')
    expect(md).toContain('<!-- Generated by PlayForge')
  })

  it('writes to a .new sibling when the user picks rename', async () => {
    await runPrompt({ json: jsonPath, projectDir: tmp, mode: 'slash' })
    prompts.inject(['rename'])
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'slash',
    })
    const renamed = join(tmp, '.claude', 'commands', 'playforge-login-flow.new.md')
    expect(existsSync(renamed)).toBe(true)
  })
})

describe('runPrompt — --dry-run', () => {
  it('prints to stdout and does not touch the filesystem', async () => {
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'slash',
      dryRun: true,
    })
    expect(existsSync(join(tmp, '.claude'))).toBe(false)

    const stdout = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(stdout).toContain('## Scenario summary')
    expect(stdout).toContain('dry-run — nothing written')
  })
})

describe('runPrompt — --no-redact', () => {
  it('embeds raw sensitive values and emits a loud warning', async () => {
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'prompt',
      redact: false,
    })

    const md = readFileSync(join(tmp, 'prompts', 'login-flow.md'), 'utf8')
    expect(md).toContain('supersecret123')
    expect(md).toContain('Redaction was disabled')

    const warned = warnSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(warned).toMatch(/--no-redact/i)
    expect(warned).toMatch(/sensitive/i)
  })
})

describe('runPrompt — -o output override', () => {
  it('writes to the exact path the user requested', async () => {
    const custom = join(tmp, 'docs', 'subdir', 'flow.md')
    await runPrompt({
      json: jsonPath,
      projectDir: tmp,
      mode: 'prompt',
      output: custom,
    })
    expect(existsSync(custom)).toBe(true)
    // No file written to the default location.
    expect(existsSync(join(tmp, 'prompts', 'login-flow.md'))).toBe(false)
  })
})

describe('runPrompt — input validation', () => {
  it('throws when the JSON path does not exist', async () => {
    await expect(
      runPrompt({
        json: join(tmp, 'missing.json'),
        projectDir: tmp,
        mode: 'slash',
      }),
    ).rejects.toThrow(/JSON export not found/)
  })

  it('throws on unsupported formatVersion', async () => {
    writeFileSync(jsonPath, JSON.stringify({ ...makePayload(), formatVersion: 99 }), 'utf8')
    await expect(runPrompt({ json: jsonPath, projectDir: tmp, mode: 'slash' })).rejects.toThrow(
      /formatVersion/,
    )
  })
})
