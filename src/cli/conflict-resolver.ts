import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import prompts from 'prompts'

export type ConflictAction = 'merge' | 'overwrite' | 'skip' | 'rename' | 'diff'

export interface ConflictDecision {
  action: ConflictAction
  /** When `action === 'rename'`, the path the caller should write to instead. */
  renamedPath?: string
}

interface ResolveContext {
  /** Absolute path of the existing file on disk. */
  targetPath: string
  /** Newly generated content (rendered by the adapter). */
  incoming: string
  /** Whether structural merge is supported for this file (currently TS page objects only). */
  canMerge: boolean
}

/**
 * Drive the interactive prompt loop. We re-prompt after a `d` (diff preview)
 * because diff is informational, not a final decision.
 */
export async function resolveConflict(ctx: ResolveContext): Promise<ConflictDecision> {
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
  // eslint-disable-next-line no-console
  console.log('--- existing\n+++ incoming')
  let i = 0
  let j = 0
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      // eslint-disable-next-line no-console
      console.log(`  ${oldLines[i]}`)
      i++
      j++
      continue
    }
    if (j < newLines.length && !oldLines.includes(newLines[j], i)) {
      // eslint-disable-next-line no-console
      console.log(`+ ${newLines[j]}`)
      j++
      continue
    }
    if (i < oldLines.length) {
      // eslint-disable-next-line no-console
      console.log(`- ${oldLines[i]}`)
      i++
    }
  }
}
