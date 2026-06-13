import { describe, it, expect, beforeEach } from 'vitest'
import { RoleNameStrategy } from '../role-name'

const strategy = new RoleNameStrategy()

describe('RoleNameStrategy', () => {
  let doc: Document

  beforeEach(() => {
    doc = document
    document.body.innerHTML = ''
  })

  it('identifies implicit button role with text content', () => {
    const el = document.createElement('button')
    el.textContent = 'Submit'
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('role-name')
    expect(result!.framework.playwright).toBe('page.getByRole(\'button\', { name: "Submit" })')
  })

  it('identifies implicit link role from a[href]', () => {
    const el = document.createElement('a')
    el.setAttribute('href', '/home')
    el.textContent = 'Go Home'
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.framework.playwright).toBe('page.getByRole(\'link\', { name: "Go Home" })')
  })

  it('identifies implicit textbox role for input', () => {
    const el = document.createElement('input')
    el.setAttribute('type', 'text')
    el.setAttribute('placeholder', 'Enter email')
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.framework.playwright).toBe(
      'page.getByRole(\'textbox\', { name: "Enter email" })',
    )
  })

  it('identifies combobox role for select with accessible name from aria-label', () => {
    const el = document.createElement('select')
    el.setAttribute('aria-label', 'Country')
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.framework.playwright).toBe('page.getByRole(\'combobox\', { name: "Country" })')
  })

  it('identifies explicit dialog role', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-label', 'Confirmation dialog')
    const result = strategy.evaluate(el, doc)

    expect(result).not.toBeNull()
    expect(result!.framework.playwright).toBe(
      'page.getByRole(\'dialog\', { name: "Confirmation dialog" })',
    )
  })
})
