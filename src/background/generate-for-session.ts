import { generateFromActions, type GenerateOptions } from '@codegen/index'
import { getActionsBySession } from '@storage/action-repo'
import { getSession } from '@storage/session-repo'
import type { FrameworkId, GeneratedCode } from '@shared/types/generated'

/** Generates code for a recorded session held in IndexedDB — the storage half of code generation. */
export async function generateForSession(
  sessionId: string,
  framework: FrameworkId,
  options: GenerateOptions = {},
): Promise<GeneratedCode> {
  const [actions, session] = await Promise.all([
    getActionsBySession(sessionId),
    getSession(sessionId),
  ])
  return generateFromActions(session, actions, framework, options)
}
