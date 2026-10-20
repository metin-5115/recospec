import { MIN_GUARDED_SECRET_LENGTH } from '@shared/constants'

/** A generated artifact still holds a recorded secret value; the artifact must not be handed out. */
export class SecretLeakError extends Error {
  constructor(
    public readonly surface: string,
    public readonly leakCount: number,
  ) {
    super(
      `Recospec ${surface} blocked: ${leakCount} recorded secret value(s) would be written in plain text.`,
    )
    this.name = 'SecretLeakError'
  }
}

/**
 * Defense-in-depth for output that must never hold a recorded secret. Both the JSON export and the
 * `.feature` file write values as double-quoted JSON strings, so a leak looks like the secret
 * between quotes. The message names the surface and a count, never the value.
 */
export function assertNoSecretValues(
  output: string,
  secrets: Iterable<string>,
  surface: string,
): void {
  let leaks = 0
  for (const secret of new Set(secrets)) {
    if (secret.length < MIN_GUARDED_SECRET_LENGTH) continue
    if (output.includes(JSON.stringify(secret))) leaks++
  }
  if (leaks > 0) throw new SecretLeakError(surface, leaks)
}
