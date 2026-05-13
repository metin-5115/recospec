import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectFramework } from '../detect-framework'
import { RC_FILENAME, type PlayforgeRc } from '../config-loader'
import type { FrameworkId } from '@shared/types/generated'

export interface InitOptions {
  projectDir: string
  framework?: FrameworkId
  bdd?: boolean
  /** Overwrite an existing rc file without prompting. */
  force?: boolean
}

/**
 * Write a fresh `.playforgerc.json` into `projectDir`. The rc pins the
 * framework so `playforge add` can skip detection on subsequent runs.
 *
 *   1. Honour `--framework` if passed.
 *   2. Otherwise run detection.
 *   3. Refuse to overwrite an existing rc unless `--force` is set.
 */
export async function runInit(opts: InitOptions): Promise<void> {
  const rcPath = resolve(opts.projectDir, RC_FILENAME)
  if (existsSync(rcPath) && !opts.force) {
    throw new Error(`${rcPath} already exists. Re-run with --force to overwrite.`)
  }

  let framework: FrameworkId | undefined = opts.framework
  if (!framework) {
    const detected = detectFramework(opts.projectDir)
    if (detected) {
      framework = detected.framework
      // eslint-disable-next-line no-console
      console.log(`[playforge] detected framework=${framework} via ${detected.source}`)
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        '[playforge] could not detect a framework — writing rc with no `framework` field. Pass --framework or hand-edit the rc later.',
      )
    }
  }

  const rc: PlayforgeRc = {
    version: 1,
    ...(framework ? { framework } : {}),
    ...(opts.bdd ? { bdd: true } : {}),
  }

  writeFileSync(rcPath, JSON.stringify(rc, null, 2) + '\n', 'utf8')
  // eslint-disable-next-line no-console
  console.log(`[playforge] wrote ${rcPath}`)
}
