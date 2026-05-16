import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearHighlightOverlay,
  evaluateLocator,
  highlightLocator,
  validateTargets,
} from './locator-validator'
import type { Locator, ScoredLocator } from '@shared/types/locator'

function scored(locator: Locator, score = 80): ScoredLocator {
  return { ...locator, score, matchCount: 1 }
}

afterEach(() => {
  document.body.innerHTML = ''
  clearHighlightOverlay()
})

describe('evaluateLocator', () => {
  it('reports matched=1 for a unique CSS selector', () => {
    document.body.innerHTML = '<button id="submit">Save</button>'
    const out = evaluateLocator(
      { strategy: 'css', selector: '#submit', framework: {} },
      undefined,
      undefined,
    )
    expect(out.status).toBe('matched')
    expect(out.matchCount).toBe(1)
    expect(out.firstMatch).toBeInstanceOf(HTMLButtonElement)
  })

  it('reports multiple when more than one element matches', () => {
    document.body.innerHTML = '<input class="x"/><input class="x"/><input class="x"/>'
    const out = evaluateLocator(
      { strategy: 'css', selector: '.x', framework: {} },
      undefined,
      undefined,
    )
    expect(out.status).toBe('multiple')
    expect(out.matchCount).toBe(3)
  })

  it('reports missing when nothing matches', () => {
    document.body.innerHTML = '<div></div>'
    const out = evaluateLocator(
      { strategy: 'css', selector: '#nope', framework: {} },
      undefined,
      undefined,
    )
    expect(out.status).toBe('missing')
    expect(out.matchCount).toBe(0)
    expect(out.firstMatch).toBeNull()
  })

  it('looks up testid via data-testid / data-test-id / data-test', () => {
    document.body.innerHTML =
      '<button data-test="login">A</button><span data-testid="login">B</span>'
    const out = evaluateLocator(
      { strategy: 'testid', selector: 'login', framework: {} },
      undefined,
      undefined,
    )
    expect(out.matchCount).toBe(2)
    expect(out.status).toBe('multiple')
  })

  it('evaluates xpath via document.evaluate', () => {
    document.body.innerHTML = '<section><h1>Hello</h1></section>'
    const out = evaluateLocator(
      { strategy: 'xpath', selector: '//h1[text()="Hello"]', framework: {} },
      undefined,
      undefined,
    )
    expect(out.status).toBe('matched')
    expect(out.firstMatch?.tagName).toBe('H1')
  })

  it('pierces a shadow root using the recorded host chain', () => {
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'widget')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<button id="go">Go</button>'

    const out = evaluateLocator(
      { strategy: 'id', selector: '#go', framework: {} },
      { hostChain: ['[data-testid="widget"]'] },
      undefined,
    )
    expect(out.status).toBe('matched')
  })

  it('returns cross-origin status when a shadow host can no longer be found', () => {
    document.body.innerHTML = '<div></div>'
    const out = evaluateLocator(
      { strategy: 'id', selector: '#go', framework: {} },
      { hostChain: ['[data-testid="missing-host"]'] },
      undefined,
    )
    expect(out.status).toBe('cross-origin')
  })

  it('handles role-name strategy by walking matching elements', () => {
    document.body.innerHTML = '<button>Submit form</button><button>Cancel</button>'
    const out = evaluateLocator(
      { strategy: 'role-name', selector: 'button[name="Submit form"]', framework: {} },
      undefined,
      undefined,
    )
    expect(out.status).toBe('matched')
    expect(out.firstMatch?.textContent).toContain('Submit form')
  })

  it('resolves role=textbox to <input> via the implicit role table (regression)', () => {
    // Mirrors the the-internet.herokuapp.com/login DOM: input + associated label.
    document.body.innerHTML = `
      <form>
        <label for="username">Username</label>
        <input id="username" type="text" name="username" />
        <label for="password">Password</label>
        <input id="password" type="password" name="password" />
      </form>
    `
    const out = evaluateLocator(
      { strategy: 'role-name', selector: 'textbox[name="Username"]', framework: {} },
      undefined,
      undefined,
    )
    expect(out.status).toBe('matched')
    expect((out.firstMatch as HTMLInputElement).id).toBe('username')
  })

  it('matches text strategy as the innermost exact-text element only', () => {
    document.body.innerHTML = '<div><h2><span>Login</span></h2></div><a>Login Page</a>'
    const out = evaluateLocator(
      { strategy: 'text', selector: 'Login', framework: {} },
      undefined,
      undefined,
    )
    expect(out.status).toBe('matched')
    expect(out.firstMatch?.tagName).toBe('SPAN')
  })

  it('reports missing for malformed CSS selectors instead of throwing', () => {
    const out = evaluateLocator(
      { strategy: 'css', selector: '>>>invalid', framework: {} },
      undefined,
      undefined,
    )
    expect(out.status).toBe('missing')
  })
})

describe('validateTargets', () => {
  it('returns one result per target with primary + fallback evaluations', () => {
    document.body.innerHTML =
      '<button id="ok">go</button><a class="link">x</a><a class="link">y</a>'
    const results = validateTargets([
      {
        actionId: 'a',
        index: 0,
        label: 'OK button',
        primary: scored({ strategy: 'css', selector: '#ok', framework: {} }),
        fallbacks: [scored({ strategy: 'css', selector: '.link', framework: {} })],
      },
      {
        actionId: 'b',
        index: 1,
        label: 'Missing link',
        primary: scored({ strategy: 'css', selector: '#missing', framework: {} }),
        fallbacks: [scored({ strategy: 'css', selector: '.link', framework: {} })],
      },
    ])
    expect(results).toHaveLength(2)
    expect(results[0].primary.status).toBe('matched')
    expect(results[0].rect).toBeDefined()
    expect(results[0].fallbacks[0].status).toBe('multiple')
    expect(results[1].primary.status).toBe('missing')
    expect(results[1].rect).toBeUndefined()
  })
})

describe('highlightLocator', () => {
  it('paints an overlay over the matched element and removes it after the duration', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<button id="b">x</button>'
    const ok = highlightLocator(
      { strategy: 'css', selector: '#b', framework: {} },
      undefined,
      undefined,
      'OK button',
      500,
    )
    expect(ok).toBe(true)
    // Two divs are appended to body: overlay rectangle + label chip.
    expect(document.body.querySelectorAll('div').length).toBe(2)
    vi.advanceTimersByTime(600)
    expect(document.body.querySelectorAll('div').length).toBe(0)
    vi.useRealTimers()
  })

  it('returns false and paints nothing when no element matches', () => {
    document.body.innerHTML = '<div></div>'
    const ok = highlightLocator(
      { strategy: 'css', selector: '#nope', framework: {} },
      undefined,
      undefined,
      undefined,
      100,
    )
    expect(ok).toBe(false)
  })
})
