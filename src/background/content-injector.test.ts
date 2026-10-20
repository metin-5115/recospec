import { describe, it, expect, beforeEach } from 'vitest'
import { CONTENT_REINJECT_MAX_ATTEMPTS } from '@shared/constants'
import { installChromeMock, type ChromeMock } from '../test-utils/chrome-mock'
import { reinjectContentScript, resetReinjectAttempts } from './content-injector'

let chromeMock: ChromeMock

beforeEach(() => {
  chromeMock = installChromeMock()
  resetReinjectAttempts(1)
  resetReinjectAttempts(2)
})

describe('reinjectContentScript', () => {
  it('injects the content script into the tab', async () => {
    await reinjectContentScript(1)
    expect(chromeMock.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ['content.js'],
    })
  })

  it('gives up on a tab after the maximum number of failed attempts', async () => {
    chromeMock.executeScript.mockRejectedValue(new Error('cannot access tab'))

    for (let i = 0; i < CONTENT_REINJECT_MAX_ATTEMPTS + 1; i++) await reinjectContentScript(1)

    expect(chromeMock.executeScript).toHaveBeenCalledTimes(CONTENT_REINJECT_MAX_ATTEMPTS)
  })

  it('counts attempts per tab and forgets them after a reset', async () => {
    chromeMock.executeScript.mockRejectedValue(new Error('nope'))
    await reinjectContentScript(1)
    await reinjectContentScript(1)
    chromeMock.executeScript.mockResolvedValue(undefined)
    await reinjectContentScript(2)
    expect(chromeMock.executeScript).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: { tabId: 2 } }),
    )

    chromeMock.executeScript.mockClear()
    chromeMock.executeScript.mockRejectedValue(new Error('nope'))
    resetReinjectAttempts(1)
    for (let i = 0; i < CONTENT_REINJECT_MAX_ATTEMPTS; i++) await reinjectContentScript(1)
    expect(chromeMock.executeScript).toHaveBeenCalledTimes(CONTENT_REINJECT_MAX_ATTEMPTS)
  })
})
