import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import prompts from 'prompts'
import type {
  ConflictAction,
  ConflictContext,
  ConflictDecision,
  ConflictReporter,
} from '@codegen/apply/conflict-reporter'

// Re-export so existing call sites (prompt.ts, add.ts, future hosts) can
// import the contract from a single place without reaching into @codegen.
export type {
  ConflictAction,
  ConflictContext,
  ConflictDecision,
  ConflictReporter,
} from '@codegen/apply/conflict-reporter'

/**
 * Drive the interactive prompt loop. We re-prompt after a `d` (diff preview)
 * because diff is informational, not a final decision.
 */
export async function resolveConflict(ctx: ConflictContext): Promise<ConflictDecision> {
  const choices = [
    ...(ctx.canMerge
      ? [
          {
            title: '[m] merge — append new methods/getters into the existing class',
            value: 'merge' as const,
          },
        ]
      : []),
    { title: '[o] overwrite — replace the existing file', value: 'overwrite' as const },
    { title: '[s] skip — keep the existing file untouched', value: 'skip' as const },
    { title: '[r] rename — write the new file with a `.new` suffix', value: 'rename' as const },
    { title: '[d] diff — show a unified diff and re-prompt', value: 'diff' as const },
  ]

  // Loop until we get a terminal action.
  for (;;) {
    const response = (await prompts({
      type: 'select',
      name: 'action',
      message: `Conflict on ${ctx.targetPath}. What should I do?`,
      choices,
      initial: ctx.canMerge ? 0 : 1,
    })) as { action?: ConflictAction }

    // User aborted (Ctrl+C) — treat as skip so we don't clobber.
    if (!response.action) return { action: 'skip' }

    if (response.action === 'diff') {
      const existing = readFileSync(ctx.targetPath, 'utf8')
      printUnifiedDiff(existing, ctx.incoming)
      continue
    }

    if (response.action === 'rename') {
      return { action: 'rename', renamedPath: renameForConflict(ctx.targetPath) }
    }

    return { action: response.action }
  }
}

/**
 * Default `ConflictReporter` for terminal hosts (CLI). Wraps the interactive
 * `prompts`-based `resolveConflict` so non-CLI hosts (e.g. the planned VS
 * Code extension) can supply their own reporter without inheriting the
 * stdin/stdout assumption.
 */
export function createTerminalReporter(): ConflictReporter {
  return {
    resolve: (ctx) => resolveConflict(ctx),
  }
}

/** `pages/LoginPage.ts` → `pages/LoginPage.new.ts`. */
export function renameForConflict(targetPath: string): string {
  const ext = extname(targetPath)
  const base = basename(targetPath, ext)
  const dir = targetPath.slice(0, targetPath.length - basename(targetPath).length)
  return `${dir}${base}.new${ext}`
}

/**
 * Tiny unified-diff renderer — good enough for CLI preview without pulling
 * in the `diff` package. Produces classic `-`/`+` lines with a header.
 */
export function printUnifiedDiff(oldText: string, newText: string): void {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  console.log('--- existing\n+++ incoming')
  let i = 0
  let j = 0
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      console.log(`  ${oldLines[i]}`)
      i++
      j++
      continue
    }
    if (j < newLines.length && !oldLines.includes(newLines[j], i)) {
      console.log(`+ ${newLines[j]}`)
      j++
      continue
    }
    if (i < oldLines.length) {
      console.log(`- ${oldLines[i]}`)
      i++
    }
  }
}
