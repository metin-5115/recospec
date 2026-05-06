import { generate } from '@codegen/index'
import { broadcastToUI } from '@shared/messaging/send'
import { logger } from '@shared/logger'

export async function handleCodeGenerate(
  sessionId: string,
  framework: 'playwright-ts',
): Promise<void> {
  try {
    const code = await generate(sessionId, framework)
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
