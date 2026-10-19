import { broadcastToUI } from '@shared/messaging/send'
import { logger } from '@shared/logger'
import type { FrameworkId } from '@shared/types/generated'
import type { GenerateOptions } from '@shared/types/generate-options'
import { flushNetworkBatch } from './event-aggregator'
import { generateForSession } from './generate-for-session'

export async function handleCodeGenerate(
  sessionId: string,
  framework: FrameworkId,
  options: GenerateOptions = {},
): Promise<void> {
  try {
    await flushNetworkBatch()
    const code = await generateForSession(sessionId, framework, options)
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
