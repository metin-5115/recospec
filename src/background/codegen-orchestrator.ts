import { generate } from '@codegen/index'
import { broadcastToUI } from '@shared/messaging/send'
import { logger } from '@shared/logger'
import type { FrameworkId } from '@shared/types/generated'
import type { TestDataConfig } from '@codegen/ir/types'

export async function handleCodeGenerate(
  sessionId: string,
  framework: FrameworkId,
  options: {
    includeMocks?: boolean
    methodRenames?: Record<string, string>
    autoWaitEnabled?: boolean
    testData?: TestDataConfig
    bdd?: boolean
  } = {},
): Promise<void> {
  try {
    const code = await generate(sessionId, framework, {
      includeMocks: options.includeMocks,
      methodRenames: options.methodRenames,
      autoWaitEnabled: options.autoWaitEnabled,
      testData: options.testData,
      bdd: options.bdd,
    })
    await broadcastToUI({ type: 'CODE_GENERATED', sessionId, code })
  } catch (err) {
    logger.error('[BG] CODE_GENERATE failed', err)
    await broadcastToUI({
      type: 'CODE_GENERATE_ERROR',
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
