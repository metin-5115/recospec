#!/usr/bin/env node
import { Command } from 'commander'
import { resolve } from 'node:path'
import { runAdd } from './commands/add'
import { runInit } from './commands/init'
import { runPrompt } from './commands/prompt'
import type { PromptMode } from '@codegen/export/prompt-export'
import type { FrameworkId } from '@shared/types/generated'

const PROMPT_MODES: PromptMode[] = ['slash', 'claude-md', 'prompt']

function validatePromptMode(value: string): PromptMode {
  if (!PROMPT_MODES.includes(value as PromptMode)) {
    // eslint-disable-next-line no-console
    console.error(`[playforge] invalid --mode ${value}. Choose one of: ${PROMPT_MODES.join(', ')}.`)
    process.exit(2)
  }
  return value as PromptMode
}

const FRAMEWORKS: FrameworkId[] = ['playwright-ts', 'cypress', 'selenium-py', 'selenium-java']

function validateFramework(value: string): FrameworkId {
  if (!FRAMEWORKS.includes(value as FrameworkId)) {
    // eslint-disable-next-line no-console
    console.error(
      `[playforge] invalid --framework ${value}. Choose one of: ${FRAMEWORKS.join(', ')}.`,
    )
    process.exit(2)
  }
  return value as FrameworkId
}

const program = new Command()

program
  .name('playforge')
  .description('PlayForge — apply a recorded session JSON onto an existing test project.')
  .version('0.7.0')

program
  .command('add')
  .description(
    'Apply a PlayForge JSON export to the project in <projectDir> (defaults to cwd).\n' +
      '  Renders page objects + the scenario file via the matching adapter, then prompts on conflicts.',
  )
  .argument('<json>', 'Path to a PlayForge JSON export (.json)')
  .argument('[projectDir]', 'Target project directory', '.')
  .option('-f, --framework <id>', `Override framework detection: ${FRAMEWORKS.join(' | ')}`)
  .option('--bdd', 'Emit Gherkin .feature + step definitions instead of a vanilla spec')
  .option('--force', 'Overwrite every conflicting file without prompting')
  .option('--dry-run', 'Do not write files; report what would change')
  .action(async (json: string, projectDir: string, options: Record<string, unknown>) => {
    const framework = options.framework ? validateFramework(options.framework as string) : undefined
    try {
      await runAdd({
        json,
        projectDir: resolve(process.cwd(), projectDir),
        framework,
        bdd: Boolean(options.bdd),
        force: Boolean(options.force),
        dryRun: Boolean(options.dryRun),
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[playforge] ${(err as Error).message}`)
      process.exit(1)
    }
  })

program
  .command('init')
  .description(
    'Write a .playforgerc.json into the project so subsequent `playforge add` calls\n' +
      '  skip framework detection. Honours --framework / --bdd; auto-detects otherwise.',
  )
  .argument('[projectDir]', 'Target project directory', '.')
  .option('-f, --framework <id>', `Pin framework: ${FRAMEWORKS.join(' | ')}`)
  .option('--bdd', 'Default to BDD mode for future `add` calls')
  .option('--force', 'Overwrite an existing .playforgerc.json')
  .action(async (projectDir: string, options: Record<string, unknown>) => {
    const framework = options.framework ? validateFramework(options.framework as string) : undefined
    try {
      await runInit({
        projectDir: resolve(process.cwd(), projectDir),
        framework,
        bdd: Boolean(options.bdd),
        force: Boolean(options.force),
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[playforge] ${(err as Error).message}`)
      process.exit(1)
    }
  })

program
  .command('prompt')
  .description(
    'Render a Claude Code prompt from a PlayForge JSON export.\n' +
      '  Modes: slash → .claude/commands/playforge-<slug>.md · claude-md → CLAUDE.md\n' +
      '  marker block (in-place replace or append) · prompt → prompts/<slug>.md',
  )
  .argument('<json>', 'Path to a PlayForge JSON export (.json)')
  .argument('[projectDir]', 'Target project directory', '.')
  .option('-m, --mode <mode>', `Output mode: ${PROMPT_MODES.join(' | ')}`, 'slash')
  .option('-n, --slug <slug>', 'Override the flow slug (defaults to slugified session name)')
  .option('-f, --framework <id>', 'Framework hint for the mission line / frontmatter')
  .option('--no-redact', 'Embed sensitive values literally — leak guard is bypassed')
  .option('-o, --output <path>', 'Write to this exact path instead of the default location')
  .option('--force', 'Overwrite an existing output file without prompting')
  .option('--dry-run', 'Render to stdout; do not write to disk')
  .action(async (json: string, projectDir: string, options: Record<string, unknown>) => {
    const mode = validatePromptMode((options.mode as string) ?? 'slash')
    const framework = options.framework ? validateFramework(options.framework as string) : undefined
    try {
      await runPrompt({
        json,
        projectDir: resolve(process.cwd(), projectDir),
        mode,
        slug: options.slug as string | undefined,
        framework,
        // commander turns `--no-redact` into `redact: false`; the default
        // (`redact === true`) is implicit when the flag is omitted.
        redact: options.redact !== false,
        force: Boolean(options.force),
        dryRun: Boolean(options.dryRun),
        output: options.output as string | undefined,
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[playforge] ${(err as Error).message}`)
      process.exit(1)
    }
  })

program.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[playforge] fatal: ${(err as Error).message}`)
  process.exit(1)
})
