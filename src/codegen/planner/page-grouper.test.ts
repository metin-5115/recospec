import { describe, it, expect } from 'vitest'
import { groupIntoPages } from './page-grouper'
import type { IRStep } from '../ir/types'

function navStep(url: string): IRStep {
  return { id: crypto.randomUUID(), action: 'navigate', url }
}

function clickStep(name: string, locatorValue: string): IRStep {
  return {
    id: crypto.randomUUID(),
    action: 'click',
    element: { name, locatorStrategy: 'testid', locatorValue, tagName: 'button' },
  }
}

describe('groupIntoPages', () => {
  it('groups steps under the start URL page', () => {
    const steps: IRStep[] = [clickStep('submitBtn', 'submit-btn')]
    const pages = groupIntoPages(steps, 'https://example.com/login')
    expect(pages).toHaveLength(1)
    expect(pages[0].className).toBe('LoginPage')
  })

  it('creates a new page on navigate', () => {
    const steps: IRStep[] = [
      clickStep('loginBtn', 'login-btn'),
      navStep('/dashboard'),
      clickStep('profileLink', 'profile-link'),
    ]
    const pages = groupIntoPages(steps, 'https://example.com/login')
    expect(pages).toHaveLength(2)
    expect(pages[0].className).toBe('LoginPage')
    expect(pages[1].className).toBe('DashboardPage')
  })

  it('maps /users/:id to UsersIdPage', () => {
    const steps: IRStep[] = [navStep('/users/:id'), clickStep('editBtn', 'edit-btn')]
    const pages = groupIntoPages(steps, 'https://example.com/')
    const userPage = pages.find((p) => p.normalizedUrl === '/users/:id')
    expect(userPage).toBeDefined()
    expect(userPage!.className).toBe('UsersIdPage')
  })

  it('deduplicates elements within the same page', () => {
    const steps: IRStep[] = [
      clickStep('submitBtn', 'submit-btn'),
      clickStep('submitBtn', 'submit-btn'),
    ]
    const pages = groupIntoPages(steps, 'https://example.com/form')
    expect(pages[0].elements).toHaveLength(1)
  })
})
