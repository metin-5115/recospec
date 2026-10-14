import { describe, it, expect } from 'vitest'
import { indentBlock, indentLines } from './indent'

describe('indentLines', () => {
  it('prefixes every non-empty line', () => {
    expect(indentLines('a\nb', '\t')).toBe('\ta\n\tb')
  })

  it('leaves blank lines untouched so no trailing whitespace is emitted', () => {
    expect(indentLines('a\n\nb', '  ')).toBe('  a\n\n  b')
  })

  it('returns an empty string unchanged', () => {
    expect(indentLines('', '  ')).toBe('')
  })
})

describe('indentBlock', () => {
  it('indents by a number of spaces', () => {
    expect(indentBlock('x\ny', 4)).toBe('    x\n    y')
  })

  it('with zero spaces is a no-op', () => {
    expect(indentBlock('x\n\ny', 0)).toBe('x\n\ny')
  })
})
