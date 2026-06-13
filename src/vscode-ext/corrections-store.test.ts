import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendCorrection, loadCorrections, correctionsFilePath } from './corrections-store'
import type { ScoredLocator, ElementFingerprint } from '@shared/types/locator'

const rejected: ScoredLocator = {
  strategy: 'xpath',
  selector: '//div[3]/button',
  score: 5,
  matchCount: 1,
  framework: {},
}
const fingerprint: ElementFingerprint = {
  tag: 'button',
  attributes: { class: 'btn' },
  role: 'button',
  accessibleName: 'Save',
  neighborTexts: [],
  domPath: 'body>form>button',
  boundingBoxRatio: { x: 0, y: 0 },
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recospec-corrections-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('corrections-store', () => {
  it('appends to .recospec/corrections.jsonl and reads back', () => {
    expect(loadCorrections(dir)).toEqual([])
    appendCorrection(dir, {
      rejected,
      chosen: 'getByRole("button",{name:"Save"})',
      fingerprint,
      at: 't1',
    })
    appendCorrection(dir, { rejected, chosen: 'getByTestId("save")', fingerprint, at: 't2' })

    expect(existsSync(correctionsFilePath(dir))).toBe(true)
    const records = loadCorrections(dir)
    expect(records).toHaveLength(2)
    expect(records[0]!.chosen).toContain('getByRole')
    expect(records[1]!.chosen).toBe('getByTestId("save")')
    expect(records[0]!.rejected.strategy).toBe('xpath')
  })

  it('creates the .recospec directory if missing', () => {
    appendCorrection(dir, { rejected, chosen: 'x', fingerprint })
    expect(existsSync(correctionsFilePath(dir))).toBe(true)
  })
})
