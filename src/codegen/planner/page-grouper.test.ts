import { describe, it, expect } from 'vitest'
import { groupIntoPages } from './page-grouper'
import type { IRStep } from '../ir/types'

function navStep(url: string, pageTitle?: string): IRStep {
  return { id: crypto.randomUUID(), action: 'navigate', url, pageTitle }
}

function clickStep(name: string, locatorValue: string): IRStep {
  return {
    id: crypto.randomUUID(),
    action: 'click',
    element: { name, locatorStrategy: 'testid', locatorValue, tagName: 'button' },
  }
}

function fillStep(name: string, locatorValue: string, value = 'test'): IRStep {
  return {
    id: crypto.randomUUID(),
    action: 'fill',
    value,
    element: { name, locatorStrategy: 'testid', locatorValue, tagName: 'input' },
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

  it('strips query string and fragment from start URL', () => {
    const steps: IRStep[] = [clickStep('btn', 'btn')]
    const pages = groupIntoPages(steps, 'https://example.com/search?q=test#results')
    // normalizeUrl strips query + fragment, so normalizedUrl should be '/search'
    expect(pages[0].normalizedUrl).toBe('/search')
  })

  it('sets collisionWarning when same URL pattern has different page titles', () => {
    const steps: IRStep[] = [
      fillStep('emailInput', 'email'),
      navStep('/dashboard', 'Dashboard - Alice'),
      clickStep('profileBtn', 'profile'),
      navStep('/dashboard', 'Dashboard - Bob'),
      clickStep('settingsBtn', 'settings'),
    ]
    const pages = groupIntoPages(steps, 'https://example.com/login')
    const dashboardPages = pages.filter((p) => p.normalizedUrl === '/dashboard')
    // Second visit to /dashboard with different title should flag collision
    expect(dashboardPages.some((p) => p.collisionWarning)).toBe(true)
  })
})
