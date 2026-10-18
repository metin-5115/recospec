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

describe('groupIntoPages — single-page app route changes', () => {
  const at = (step: IRStep, pageUrl: string): IRStep => ({ ...step, pageUrl })

  it('starts a new page when the route changes without a navigate step', () => {
    const steps: IRStep[] = [
      at(clickStep('addBtn', 'add'), '/shop'),
      at(clickStep('cartLink', 'cart-link'), '/shop'),
      at(fillStep('promoInput', 'promo'), '/cart'),
      at(clickStep('checkoutBtn', 'checkout'), '/cart'),
      at(fillStep('nameInput', 'name'), '/checkout'),
    ]
    const pages = groupIntoPages(steps, 'https://example.com/shop')
    expect(pages.map((p) => p.className)).toEqual(['ShopPage', 'CartPage', 'CheckoutPage'])
    expect(pages.map((p) => p.steps.length)).toEqual([2, 2, 1])
    expect(pages[1]!.elements.map((e) => e.name)).toEqual(['promoInput', 'checkoutBtn'])
    // No synthetic navigate: the route changed through the UI, so replay must not reload the app.
    expect(pages.flatMap((p) => p.steps).some((s) => s.action === 'navigate')).toBe(false)
  })

  it('does not let a trailing wait or network step with a new route open a page', () => {
    const wait: IRStep = {
      id: crypto.randomUUID(),
      action: 'wait',
      wait: { reason: 'networkidle', timeoutMs: 10_000 },
      pageUrl: '/dashboard',
    }
    const net: IRStep = {
      id: crypto.randomUUID(),
      action: 'network',
      network: { method: 'POST', url: 'https://example.com/api/login', status: 200 },
      pageUrl: '/dashboard',
    }
    const steps: IRStep[] = [at(clickStep('signIn', 'sign-in'), '/login'), net, wait]
    const pages = groupIntoPages(steps, 'https://example.com/login')
    expect(pages.map((p) => p.className)).toEqual(['LoginPage'])
  })

  it('does not split a normal multi-page flow that already has navigate steps', () => {
    const steps: IRStep[] = [
      at(clickStep('loginBtn', 'login-btn'), '/login'),
      navStep('/dashboard'),
      at(clickStep('profileLink', 'profile-link'), '/dashboard'),
    ]
    const pages = groupIntoPages(steps, 'https://example.com/login')
    expect(pages.map((p) => p.className)).toEqual(['LoginPage', 'DashboardPage'])
  })

  it('keeps one page when every step reports the same route', () => {
    const steps: IRStep[] = [at(clickStep('a', 'a'), '/shop'), at(clickStep('b', 'b'), '/shop')]
    expect(groupIntoPages(steps, 'https://example.com/shop')).toHaveLength(1)
  })

  it('gives a revisited route its own uniquely named page', () => {
    const steps: IRStep[] = [
      at(clickStep('a', 'a'), '/shop'),
      at(clickStep('b', 'b'), '/cart'),
      at(clickStep('c', 'c'), '/shop'),
    ]
    const pages = groupIntoPages(steps, 'https://example.com/shop')
    expect(pages.map((p) => p.className)).toEqual(['ShopPage', 'CartPage', 'ShopPage2'])
  })

  it('records the origin the session started on for every page', () => {
    const steps: IRStep[] = [clickStep('a', 'a'), navStep('/dashboard'), clickStep('b', 'b')]
    const pages = groupIntoPages(steps, 'http://localhost:4500/shop?x=1')
    expect(pages.map((p) => p.baseUrl)).toEqual(['http://localhost:4500', 'http://localhost:4500'])
  })

  it('leaves the origin out for non-http start URLs', () => {
    const pages = groupIntoPages([clickStep('a', 'a')], 'file:///tmp/fixture.html')
    expect(pages[0]?.baseUrl).toBeUndefined()
  })
})
