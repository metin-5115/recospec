/**
 * Host-agnostic conflict-resolution contract used by `runAdd` when an
 * adapter-emitted file already exists at the target path.
 *
 * Lives under `@codegen/apply` (rather than under `src/cli/`) so non-CLI
 * hosts — VS Code extension, web playground, future test harnesses — can
 * import the types without dragging in `prompts` or other Node-only deps.
 * The default terminal implementation is `createTerminalReporter` in
 * `src/cli/conflict-resolver.ts`; a VS Code host would supply its own
 * reporter that opens a webview dialog instead.
 *
 * No runtime logic lives here on purpose — this file is a pure type module.
 */

export type ConflictAction = 'merge' | 'overwrite' | 'skip' | 'rename' | 'diff'

export interface ConflictDecision {
  action: ConflictAction
  /** When `action === 'rename'`, the path the caller should write to instead. */
  renamedPath?: string
}

export interface ConflictContext {
  /** Absolute path of the existing file on disk. */
  targetPath: string
  /** Newly generated content (rendered by the adapter). */
  incoming: string
  /** Whether structural merge is supported for this file. */
  canMerge: boolean
}

export interface ConflictReporter {
  /**
   * Resolve a single file-write conflict. Implementations may prompt the
   * user, consult a webview, or auto-decide based on host policy. Must
   * eventually return a terminal action (anything other than `'diff'`);
   * `'diff'` is reserved for the terminal reporter's internal re-prompt
   * loop and must NOT escape to the caller.
   */
  resolve(ctx: ConflictContext): Promise<ConflictDecision>
}
