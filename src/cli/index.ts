#!/usr/bin/env node
import { Command } from 'commander'
import { resolve } from 'node:path'
import { runAdd } from './commands/add'
import { runInit } from './commands/init'
import type { FrameworkId } from '@shared/types/generated'

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
  .version('0.6.0')

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

program.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[playforge] fatal: ${(err as Error).message}`)
  process.exit(1)
})
