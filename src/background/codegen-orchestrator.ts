import { generate } from '@codegen/index'
import { broadcastToUI } from '@shared/messaging/send'
import { logger } from '@shared/logger'
import { flushNetworkBatch } from './event-aggregator'
import type { FrameworkId, OutputSelection } from '@shared/types/generated'
import type { TestDataConfig, TemplateParamMode } from '@codegen/ir/types'
import type { ComposedParamMode } from '@codegen/planner/template-modes'

export async function handleCodeGenerate(
  sessionId: string,
  framework: FrameworkId,
  options: {
    includeMocks?: boolean
    selfHealing?: boolean
    finalStateAssertion?: boolean
    methodRenames?: Record<string, string>
    autoWaitEnabled?: boolean
    testData?: TestDataConfig
    bdd?: boolean
    selection?: OutputSelection
    composedModes?: Record<string, ComposedParamMode>
    templateModes?: Record<string, TemplateParamMode>
  } = {},
): Promise<void> {
  try {
    await flushNetworkBatch()
    const code = await generate(sessionId, framework, {
      includeMocks: options.includeMocks,
      selfHealing: options.selfHealing,
      finalStateAssertion: options.finalStateAssertion,
      methodRenames: options.methodRenames,
      autoWaitEnabled: options.autoWaitEnabled,
      testData: options.testData,
      bdd: options.bdd,
      selection: options.selection,
      composedModes: options.composedModes,
      templateModes: options.templateModes,
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
