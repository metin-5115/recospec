import { describe, it, expect } from 'vitest'
import { computeAccessibleName } from '../accessible-name'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('computeAccessibleName — ARIA spec ordering', () => {
  it('aria-labelledby beats every other source', () => {
    const doc = parse(
      `<span id="lbl">Primary action</span><button aria-labelledby="lbl" aria-label="Secondary">Click</button>`,
    )
    const btn = doc.querySelector('button')!
    expect(computeAccessibleName(btn, doc, 'button')).toBe('Primary action')
  })

  it('aria-labelledby concatenates referenced ids in order', () => {
    const doc = parse(
      `<span id="a">Edit</span><span id="b">profile</span><button aria-labelledby="a b">x</button>`,
    )
    const btn = doc.querySelector('button')!
    expect(computeAccessibleName(btn, doc, 'button')).toBe('Edit profile')
  })

  it('aria-label wins over native label when aria-labelledby is absent', () => {
    const doc = parse(`<label for="f">Visible</label><input id="f" aria-label="Override" />`)
    const input = doc.querySelector('input')!
    expect(computeAccessibleName(input, doc, 'textbox')).toBe('Override')
  })

  it('falls back to <label for=…> for input', () => {
    const doc = parse(`<label for="f">Email Address</label><input id="f" type="email" />`)
    const input = doc.querySelector('input')!
    expect(computeAccessibleName(input, doc, 'textbox')).toBe('Email Address')
  })

  it('falls back to wrapping label for input', () => {
    const doc = parse(`<label>Username <input type="text" /></label>`)
    const input = doc.querySelector('input')!
    expect(computeAccessibleName(input, doc, 'textbox')).toBe('Username')
  })

  it('uses alt for img', () => {
    const doc = parse(`<img alt="Company logo" src="logo.png" />`)
    const img = doc.querySelector('img')!
    expect(computeAccessibleName(img, doc, 'img')).toBe('Company logo')
  })

  it('uses caption for table', () => {
    const doc = parse(`<table><caption>Quarterly results</caption><tr><td>x</td></tr></table>`)
    const table = doc.querySelector('table')!
    expect(computeAccessibleName(table, doc, 'table')).toBe('Quarterly results')
  })

  it('uses legend for fieldset', () => {
    const doc = parse(`<fieldset><legend>Shipping address</legend><input /></fieldset>`)
    const fs = doc.querySelector('fieldset')!
    expect(computeAccessibleName(fs, doc, 'group')).toBe('Shipping address')
  })

  it('uses value for submit input', () => {
    const doc = parse(`<input type="submit" value="Send message" />`)
    const input = doc.querySelector('input')!
    expect(computeAccessibleName(input, doc, 'button')).toBe('Send message')
  })

  it('falls back to text content for button when no aria/label provided', () => {
    const doc = parse(`<button>Save</button>`)
    const btn = doc.querySelector('button')!
    expect(computeAccessibleName(btn, doc, 'button')).toBe('Save')
  })

  it('falls back to placeholder for input when no label exists', () => {
    const doc = parse(`<input type="text" placeholder="Search products" />`)
    const input = doc.querySelector('input')!
    expect(computeAccessibleName(input, doc, 'textbox')).toBe('Search products')
  })

  it('falls back to title attribute when neither label nor placeholder is set', () => {
    const doc = parse(`<a href="#" title="Profile menu"><svg></svg></a>`)
    const link = doc.querySelector('a')!
    expect(computeAccessibleName(link, doc, 'link')).toBe('Profile menu')
  })

  it('falls back to aria-describedby when nothing else applies (project-specific)', () => {
    const doc = parse(
      `<span id="hint">Receive marketing emails</span><input type="checkbox" aria-describedby="hint" />`,
    )
    const cb = doc.querySelector('input')!
    expect(computeAccessibleName(cb, doc, 'checkbox')).toBe('Receive marketing emails')
  })

  it('returns null when no name can be resolved', () => {
    const doc = parse(`<div><span></span></div>`)
    const span = doc.querySelector('span')!
    expect(computeAccessibleName(span, doc)).toBeNull()
  })

  it('does not use text content as the name for textbox role', () => {
    const doc = parse(`<input type="text" />Decorative span text`)
    const input = doc.querySelector('input')!
    expect(computeAccessibleName(input, doc, 'textbox')).toBeNull()
  })

  it('rejects subtree text longer than 100 chars', () => {
    const doc = parse(`<button>${'x'.repeat(101)}</button>`)
    const btn = doc.querySelector('button')!
    expect(computeAccessibleName(btn, doc, 'button')).toBeNull()
  })
})
