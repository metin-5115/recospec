import { describe, it, expect } from 'vitest'
import {
  applyComposedModes,
  applyTemplateModes,
  collectComposedOccurrences,
  collectTemplateOccurrences,
} from './template-modes'
import type { IRElement, IRStep } from '../ir/types'

const dateCell: IRElement = {
  name: 'dateCell',
  locatorStrategy: 'template',
  locatorValue: 'gridcell:{date}',
  tagName: 'td',
  template: {
    strategy: 'role-name',
    role: 'gridcell',
    nameTemplate: '{date:d MMMM yyyy:en-US}',
    capturedValue: '12 March 2026',
    capturedNormalized: '2026-03-12',
    kind: 'date',
    pattern: 'd MMMM yyyy',
    localeId: 'en-US',
    xpath: '//td',
  },
}

const priceRow: IRElement = {
  name: 'priceCell',
  locatorStrategy: 'composed',
  locatorValue: 'div.card >> p.price',
  tagName: 'p',
  composed: {
    anchor: {
      kind: 'container',
      value: 'Hotel Aurora',
      css: 'div.card',
      filterText: 'Hotel Aurora',
    },
    target: { tag: 'p', css: 'p.price' },
    xpath: '//p',
  },
}

const plainButton: IRElement = {
  name: 'saveBtn',
  locatorStrategy: 'testid',
  locatorValue: 'save',
  tagName: 'button',
}

const step = (id: string, element: IRElement): IRStep => ({ id, action: 'click', element })

describe('applyTemplateModes', () => {
  it('sets the chosen mode on the template element it is keyed to', () => {
    const el = { ...dateCell }
    applyTemplateModes([step('a', el)], { [el.locatorValue]: 'relative' })
    expect(el.templateParamMode).toBe('relative')
  })

  it('leaves elements without a template, and unkeyed templates, alone', () => {
    const plain = { ...plainButton }
    const date = { ...dateCell }
    applyTemplateModes([step('a', plain), step('b', date)], { other: 'fixed' })
    expect(plain.templateParamMode).toBeUndefined()
    expect(date.templateParamMode).toBeUndefined()
  })

  it('does nothing without modes', () => {
    const el = { ...dateCell }
    applyTemplateModes([step('a', el)], undefined)
    expect(el.templateParamMode).toBeUndefined()
  })
})

describe('collectTemplateOccurrences', () => {
  it('lists each template once, however often it is used', () => {
    const found = collectTemplateOccurrences([
      step('a', dateCell),
      step('b', dateCell),
      step('c', plainButton),
    ])
    expect(found).toEqual([
      {
        key: 'gridcell:{date}',
        elementName: 'dateCell',
        kind: 'date',
        capturedValue: '12 March 2026',
        pattern: 'd MMMM yyyy',
        localeId: 'en-US',
      },
    ])
  })
})

describe('applyComposedModes', () => {
  it('parameterizes a container-anchored element', () => {
    const el = { ...priceRow }
    applyComposedModes([step('a', el)], { [el.locatorValue]: 'param' })
    expect(el.composedParamMode).toBe('param')
  })

  it('ignores composed elements that are not container-anchored', () => {
    const el: IRElement = {
      ...priceRow,
      composed: {
        ...priceRow.composed!,
        anchor: { kind: 'testid', value: 'x', css: '[data-testid=x]' },
      },
    }
    applyComposedModes([step('a', el)], { [el.locatorValue]: 'param' })
    expect(el.composedParamMode).toBeUndefined()
  })

  it('does nothing without modes', () => {
    const el = { ...priceRow }
    applyComposedModes([step('a', el)], undefined)
    expect(el.composedParamMode).toBeUndefined()
  })
})

describe('collectComposedOccurrences', () => {
  it('offers rows scoped by a stable label, once each', () => {
    expect(collectComposedOccurrences([step('a', priceRow), step('b', priceRow)])).toEqual([
      { key: 'div.card >> p.price', elementName: 'priceCell', label: 'Hotel Aurora' },
    ])
  })

  it('skips containers without a label and non-container anchors', () => {
    const noLabel: IRElement = {
      ...priceRow,
      composed: {
        ...priceRow.composed!,
        anchor: { kind: 'container', value: '', css: 'div.card' },
      },
    }
    expect(collectComposedOccurrences([step('a', noLabel), step('b', plainButton)])).toEqual([])
  })
})
