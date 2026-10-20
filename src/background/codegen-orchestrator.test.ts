import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installChromeMock, type ChromeMock } from '../test-utils/chrome-mock'

const generateForSession = vi.hoisted(() => vi.fn())
const flushNetworkBatch = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('./generate-for-session', () => ({ generateForSession }))
vi.mock('./event-aggregator', () => ({ flushNetworkBatch }))

import { handleCodeGenerate } from './codegen-orchestrator'

let chromeMock: ChromeMock

beforeEach(() => {
  chromeMock = installChromeMock()
  generateForSession.mockReset()
  flushNetworkBatch.mockClear()
})

describe('handleCodeGenerate', () => {
  it('stores pending network calls first, then generates with the requested options', async () => {
    generateForSession.mockResolvedValue({ framework: 'cypress', files: [] })
    const options = { includeMocks: true, bdd: false }

    await handleCodeGenerate('s1', 'cypress', options)

    expect(flushNetworkBatch).toHaveBeenCalledBefore(generateForSession)
    expect(generateForSession).toHaveBeenCalledWith('s1', 'cypress', options)
  })

  it('broadcasts the generated code', async () => {
    const code = { framework: 'cypress', files: [{ filename: 'a.js', content: 'x' }] }
    generateForSession.mockResolvedValue(code)

    await handleCodeGenerate('s1', 'cypress')

    expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith({
      type: 'CODE_GENERATED',
      sessionId: 's1',
      code,
    })
  })

  it('reports a failure to the side panel instead of throwing', async () => {
    generateForSession.mockRejectedValue(new Error('Nothing to generate'))

    await expect(handleCodeGenerate('s1', 'playwright-ts')).resolves.toBeUndefined()

    expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith({
      type: 'CODE_GENERATE_ERROR',
      sessionId: 's1',
      error: 'Nothing to generate',
    })
  })

  it('reports a non-Error failure as text', async () => {
    generateForSession.mockRejectedValue('plain string')
    await handleCodeGenerate('s1', 'playwright-ts')
    expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CODE_GENERATE_ERROR', error: 'plain string' }),
    )
  })
})
