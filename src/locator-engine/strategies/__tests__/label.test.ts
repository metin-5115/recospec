import { describe, it, expect, beforeEach } from 'vitest'
import { LabelStrategy } from '../label'

const strategy = new LabelStrategy()

describe('LabelStrategy', () => {
  let doc: Document

  beforeEach(() => {
    doc = document
    document.body.innerHTML = ''
  })

  it('finds label via explicit for= association', () => {
    const label = document.createElement('label')
    label.setAttribute('for', 'email')
    label.textContent = 'Email address'
    const input = document.createElement('input')
    input.id = 'email'
    input.setAttribute('type', 'email')
    document.body.append(label, input)

    const result = strategy.evaluate(input, doc)

    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('label')
    expect(result!.selector).toBe('Email address')
    expect(result!.framework.playwright).toBe('page.getByLabel("Email address")')
  })

  it('finds label via wrapping label element', () => {
    const label = document.createElement('label')
    label.textContent = 'Password'
    const input = document.createElement('input')
    input.setAttribute('type', 'password')
    label.appendChild(input)
    document.body.appendChild(label)

    const result = strategy.evaluate(input, doc)

    expect(result).not.toBeNull()
    expect(result!.selector).toBe('Password')
    expect(result!.framework.playwright).toBe('page.getByLabel("Password")')
  })

  it('returns null when no label association exists', () => {
    const input = document.createElement('input')
    input.setAttribute('type', 'text')
    input.setAttribute('placeholder', 'Search...')
    document.body.appendChild(input)

    expect(strategy.evaluate(input, doc)).toBeNull()
  })

  it('wrapping label: excludes input text from label text', () => {
    const label = document.createElement('label')
    const span = document.createElement('span')
    span.textContent = 'Username'
    const input = document.createElement('input')
    input.setAttribute('type', 'text')
    label.appendChild(span)
    label.appendChild(input)
    document.body.appendChild(label)

    const result = strategy.evaluate(input, doc)
    expect(result!.selector).toBe('Username')
  })
})
