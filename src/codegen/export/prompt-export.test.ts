import { describe, it, expect } from 'vitest'
import {
  buildPromptDocument,
  renderPromptMarkdown,
  assertNoLeakedSecrets,
  PromptRedactionError,
} from './prompt-export'
import type { JsonExportPayload } from './json-export'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const FIXED_EXPORTED_AT = 1_715_000_000_000 // 2024-05-06T16:53:20.000Z

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    name: 'Login Flow',
    state: 'stopped',
    startUrl: 'https://example.com/login',
    startedAt: FIXED_EXPORTED_AT - 60_000,
    stoppedAt: FIXED_EXPORTED_AT - 1_000,
    metadata: {
      userAgent: 'test-agent',
      viewport: { width: 1280, height: 800 },
      timezone: 'UTC',
    },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'sig-1',
    ...overrides,
  }
}

function makePayload(actions: RecordedAction[], session?: Partial<Session>): JsonExportPayload {
  return {
    exportedAt: FIXED_EXPORTED_AT,
    formatVersion: 1,
    session: makeSession(session),
    actions,
  }
}

function makeAction(
  partial: Partial<RecordedAction> & Pick<RecordedAction, 'type'>,
  idx: number,
): RecordedAction {
  return {
    actionId: `action-${idx}`,
    sessionId: 'session-1',
    sequenceNumber: idx,
    timestamp: FIXED_EXPORTED_AT - 60_000 + idx * 100,
    pageUrl: 'https://example.com/login',
    ...partial,
  }
}

/**
 * Build a `fill` action keyed by an aria-label. The aria-label strategy yields
 * a suffixed camelCase name (e.g. `emailInput`), which keeps the prompt
 * assertions readable.
 */
function fillAction(
  idx: number,
  ariaLabel: string,
  value: string,
  extraAttrs: Record<string, string> = {},
  pageUrl = 'https://example.com/login',
): RecordedAction {
  const attributes: Record<string, string> = {
    type: 'text',
    name: ariaLabel.toLowerCase(),
    ...extraAttrs,
    'aria-label': ariaLabel,
  }
  return makeAction(
    {
      type: 'fill',
      pageUrl,
      target: {
        primaryLocator: {
          strategy: 'aria-label',
          selector: `[aria-label="${ariaLabel}"]`,
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'input', attributes, textContent: '' },
      },
      payload: { value },
    },
    idx,
  )
}

function clickAction(
  idx: number,
  selector: string,
  text: string,
  pageUrl = 'https://example.com/login',
  tagName = 'button',
  strategy: 'aria-label' | 'testid' | 'css' | 'xpath' = 'aria-label',
): RecordedAction {
  return makeAction(
    {
      type: 'click',
      pageUrl,
      target: {
        primaryLocator: {
          strategy,
          selector,
          framework: {},
          score: 100,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: {
          tagName,
          attributes: { type: 'submit', 'aria-label': text },
          textContent: text,
        },
      },
    },
    idx,
  )
}

function navAction(idx: number, url: string, title?: string): RecordedAction {
  return makeAction({ type: 'navigate', pageUrl: url, pageTitle: title }, idx)
}

function keyAction(
  idx: number,
  key: string,
  pageUrl = 'https://example.com/search',
): RecordedAction {
  return makeAction({ type: 'keypress', pageUrl, payload: { key } }, idx)
}

function networkAction(
  idx: number,
  method: string,
  url: string,
  status: number,
  pageUrl: string,
): RecordedAction {
  return makeAction(
    {
      type: 'network',
      pageUrl,
      payload: { method, url, status, contentType: 'application/json' },
    },
    idx,
  )
}

// ---------------------------------------------------------------------------
// Pre-built flows
// ---------------------------------------------------------------------------

const loginFlow: RecordedAction[] = [
  fillAction(0, 'Email', 'alice@example.com', { type: 'email' }),
  fillAction(1, 'Password', 'supersecret123', { type: 'password' }),
  clickAction(2, '[aria-label="Sign In"]', 'Sign In'),
]

const searchFlow: RecordedAction[] = [
  fillAction(0, 'Search', 'Recospec', { type: 'search' }, 'https://example.com/search'),
  keyAction(1, 'Enter'),
]

const multiPageFlow: RecordedAction[] = [
  ...loginFlow,
  navAction(3, 'https://example.com/dashboard', 'Dashboard'),
  clickAction(4, '[aria-label="Welcome"]', 'Welcome', 'https://example.com/dashboard', 'div'),
]

const networkFlow: RecordedAction[] = [
  ...loginFlow,
  networkAction(3, 'POST', 'https://api.example.com/auth/login', 200, 'https://example.com/login'),
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildPromptDocument — login flow (sensitive redaction)', () => {
  it('redacts password fill value and registers a redaction map entry', () => {
    const payload = makePayload(loginFlow)
    const doc = buildPromptDocument(payload, { mode: 'slash', framework: 'playwright-ts' })

    const md = renderPromptMarkdown(doc)

    expect(md).not.toContain('supersecret123')
    expect(md).toContain('[REDACTED:RECOSPEC_PASSWORD]')

    const pwEntry = doc.redactionMap.find((r) => r.envVarName === 'RECOSPEC_PASSWORD')
    expect(pwEntry).toBeDefined()
    expect(pwEntry?.rawValue).toBe('supersecret123')
    expect(pwEntry?.placeholder).toBe('[REDACTED:RECOSPEC_PASSWORD]')

    expect(md).toContain('<secrets>')
    expect(md).toContain('<sensitive_param name="password"')
    expect(md).toContain('env_var="RECOSPEC_PASSWORD"')
    expect(md).toMatchSnapshot()
  })
})

describe('buildPromptDocument — search flow (single inferred method)', () => {
  it('renders a single search method with no sensitive params', () => {
    const payload = makePayload(searchFlow, {
      name: 'Search Flow',
      startUrl: 'https://example.com/search',
    })
    const doc = buildPromptDocument(payload, { mode: 'prompt', framework: 'cypress' })

    expect(doc.flowSlug).toBe('search-flow')
    expect(doc.redactionMap).toHaveLength(0)

    const md = renderPromptMarkdown(doc)
    expect(md).toContain('search')
    expect(md).toContain('Recospec')
    expect(md).toContain('<pages>')
    expect(md).toContain('<method name=')
    expect(md).toMatchSnapshot()
  })
})

describe('buildPromptDocument — multi-page flow (page grouping)', () => {
  it('emits one page section per recorded page boundary', () => {
    const payload = makePayload(multiPageFlow)
    const doc = buildPromptDocument(payload, { mode: 'prompt', framework: 'playwright-ts' })

    const pagesXml = doc.sections.find((s) => s.id === 'pages')?.xml
    expect(pagesXml).toContain('<page class="LoginPage"')
    expect(pagesXml).toContain('<page class="DashboardPage"')

    const md = renderPromptMarkdown(doc)
    const pageMatches = md.match(/<page class="(Login|Dashboard)Page"/g) ?? []
    expect(pageMatches.length).toBeGreaterThanOrEqual(2)
    expect(md).toMatchSnapshot()
  })
})

describe('buildPromptDocument — network mock guidance', () => {
  it('lists captured requests and instructs Authorization/Cookie stripping', () => {
    const payload = makePayload(networkFlow)
    const doc = buildPromptDocument(payload, { mode: 'prompt', framework: 'playwright-ts' })

    const md = renderPromptMarkdown(doc)
    expect(md).toContain('<network_mocks strip_headers=')
    expect(md).toContain('method="POST"')
    expect(md).toContain('https://api.example.com/auth/login')
    expect(md).toContain('Authorization')
    expect(md).toContain('Cookie')
    expect(md).toContain('Set-Cookie')
    expect(md).toMatchSnapshot()
  })
})

describe('buildPromptDocument — frontmatter only in slash mode', () => {
  it('emits YAML frontmatter for slash mode', () => {
    const doc = buildPromptDocument(makePayload(loginFlow), {
      mode: 'slash',
      framework: 'playwright-ts',
    })
    expect(doc.frontmatter).toBeDefined()
    const md = renderPromptMarkdown(doc)
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('description: Recospec recorded flow')
    expect(md).toContain('allowed-tools:')
  })

  it('omits frontmatter for prompt mode', () => {
    const doc = buildPromptDocument(makePayload(loginFlow), { mode: 'prompt' })
    expect(doc.frontmatter).toBeUndefined()
    const md = renderPromptMarkdown(doc)
    expect(md.startsWith('---\n')).toBe(false)
    expect(md).not.toContain('allowed-tools:')
  })

  it('omits frontmatter for claude-md mode', () => {
    const doc = buildPromptDocument(makePayload(loginFlow), { mode: 'claude-md' })
    expect(doc.frontmatter).toBeUndefined()
    const md = renderPromptMarkdown(doc)
    expect(md.startsWith('---\n')).toBe(false)
  })
})

describe('buildPromptDocument — claude-md marker block', () => {
  it('wraps the document in BEGIN/END recospec:<slug> markers', () => {
    const doc = buildPromptDocument(makePayload(loginFlow), {
      mode: 'claude-md',
      flowSlug: 'login',
    })
    const md = renderPromptMarkdown(doc)
    expect(md).toContain('<!-- BEGIN recospec:login -->')
    expect(md).toContain('<!-- END recospec:login -->')
    expect(md.indexOf('<!-- BEGIN recospec:login -->')).toBeLessThan(
      md.indexOf('<!-- END recospec:login -->'),
    )
  })
})

describe('assertNoLeakedSecrets — deliberate-leak fixture', () => {
  it('throws PromptRedactionError on password key=value patterns', () => {
    const leaky = 'Some innocent text\npassword: "leakedvalue123"\nmore text\n'
    expect(() => assertNoLeakedSecrets(leaky)).toThrow(PromptRedactionError)
  })

  it('throws on Authorization Bearer leaks', () => {
    const leaky = 'header dump\nAuthorization: Bearer abc123def456ghi\n'
    let caught: unknown
    try {
      assertNoLeakedSecrets(leaky)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(PromptRedactionError)
    expect((caught as PromptRedactionError).leaks.length).toBeGreaterThan(0)
  })

  it('accepts a clean rendered document', () => {
    expect(() => assertNoLeakedSecrets('No secrets here, just prose.\n')).not.toThrow()
  })
})

describe('buildPromptDocument — empty session', () => {
  it('renders graceful placeholders without throwing', () => {
    const payload = makePayload([], { name: 'Empty', startUrl: 'https://example.com/' })
    const doc = buildPromptDocument(payload, { mode: 'prompt' })
    const md = renderPromptMarkdown(doc)
    expect(md).toContain('<pages empty="true"/>')
    expect(md).toContain('<flow empty="true"/>')
    expect(md).toContain('<network_mocks empty="true"/>')
    expect(md).toContain('<secrets empty="true"/>')
    expect(md).toContain('<fragility_hints empty="true"/>')
    expect(doc.redactionMap).toHaveLength(0)
  })
})

describe('buildPromptDocument — --no-redact path', () => {
  it('keeps raw sensitive values and bypasses the leak guard', () => {
    const payload = makePayload(loginFlow)
    const doc = buildPromptDocument(payload, { mode: 'prompt', redactSecrets: false })

    expect(doc.redactSecrets).toBe(false)
    expect(doc.redactionMap).toHaveLength(0)

    const md = renderPromptMarkdown(doc)
    expect(md).toContain('supersecret123')
    expect(md).toContain('Redaction was disabled')
    // Raw values are present; the guard was *bypassed* internally rather than
    // satisfied, which is what this test pins down.
  })
})

describe('buildPromptDocument — fragility hints', () => {
  it('flags xpath / css strategies as last-resort', () => {
    const fragileFlow: RecordedAction[] = [
      clickAction(
        0,
        '//*[@id="weird-anchor"]',
        'Click me',
        'https://example.com/page',
        'a',
        'xpath',
      ),
    ]
    const payload = makePayload(fragileFlow, { startUrl: 'https://example.com/page' })
    const doc = buildPromptDocument(payload, { mode: 'prompt' })
    const md = renderPromptMarkdown(doc)
    expect(md).toContain('<fragility_hints>')
    expect(md).toContain('reason="xpath-last-resort"')
    expect(md).toContain('last-resort')
  })

  it('flags elements inside closed shadow roots and renders fallback locators', () => {
    const action = makeAction(
      {
        type: 'click',
        pageUrl: 'https://example.com/page',
        target: {
          primaryLocator: {
            strategy: 'css',
            selector: '.fragile-btn',
            framework: {},
            score: 50,
            matchCount: 1,
          },
          fallbackLocators: [
            {
              strategy: 'aria-label',
              selector: '[aria-label="Submit"]',
              framework: {},
              score: 40,
              matchCount: 1,
            },
          ],
          elementSnapshot: {
            tagName: 'button',
            attributes: { 'aria-label': 'Submit' },
            textContent: 'Submit',
          },
          shadowClosed: true,
        },
      },
      0,
    )
    const payload = makePayload([action], { startUrl: 'https://example.com/page' })
    const doc = buildPromptDocument(payload, { mode: 'prompt' })
    const md = renderPromptMarkdown(doc)
    expect(md).toContain('closed shadow root')
    // Fallback locator surfaces in the catalogue JSON block:
    expect(md).toContain('<fallback rank="1" strategy="aria-label">')
    expect(md).toContain('[aria-label=&quot;Submit&quot;]')
  })
})

describe('buildPromptDocument — render integrates guard', () => {
  it('does not throw on a clean redacted login render (default options)', () => {
    const payload = makePayload(loginFlow)
    const doc = buildPromptDocument(payload, { mode: 'slash', framework: 'playwright-ts' })
    expect(() => renderPromptMarkdown(doc)).not.toThrow()
  })
})

describe('buildPromptDocument — verification expectations from assertions', () => {
  function assertAction(
    idx: number,
    selector: string,
    text: string,
    assertionType: 'visible' | 'text' | 'attribute' | 'count' | 'value' | 'hidden' | 'screenshot',
    extras: {
      expected?: string | number
      attribute?: string
      name?: string
      threshold?: number
    } = {},
  ): RecordedAction {
    return makeAction(
      {
        type: 'assert',
        pageUrl: 'https://example.com/dashboard',
        target: {
          primaryLocator: {
            strategy: 'aria-label',
            selector,
            framework: {},
            score: 100,
            matchCount: 1,
          },
          fallbackLocators: [],
          elementSnapshot: {
            tagName: 'div',
            attributes: { 'aria-label': text },
            textContent: text,
          },
        },
        payload: {
          assertionType,
          ...extras,
        },
      },
      idx,
    )
  }

  it('renders assertions in plain English with element references', () => {
    const flow: RecordedAction[] = [
      navAction(0, 'https://example.com/dashboard', 'Dashboard'),
      assertAction(1, '[aria-label="Welcome"]', 'Welcome', 'visible'),
      assertAction(2, '[aria-label="Banner"]', 'Banner', 'hidden'),
      assertAction(3, '[aria-label="Counter"]', 'Counter', 'text', { expected: 'Hello' }),
      assertAction(4, '[aria-label="EmailField"]', 'EmailField', 'value', { expected: 'a@b' }),
      assertAction(5, '[aria-label="Avatar"]', 'Avatar', 'attribute', {
        attribute: 'src',
        expected: '/avatar.png',
      }),
      assertAction(6, '[aria-label="Items"]', 'Items', 'count', { expected: 3 }),
      assertAction(7, '[aria-label="Hero"]', 'Hero', 'screenshot', {
        name: 'dashboard-hero',
        threshold: 0.1,
      }),
    ]
    const payload = makePayload(flow, {
      name: 'Dashboard checks',
      startUrl: 'https://example.com/dashboard',
    })
    const doc = buildPromptDocument(payload, { mode: 'prompt' })
    const flowSection = doc.sections.find((s) => s.id === 'flow')
    expect(flowSection?.xml).toContain('Verify')
    expect(flowSection?.xml).toContain('is visible')
    expect(flowSection?.xml).toContain('is hidden')
    expect(flowSection?.xml).toContain('has text')
    expect(flowSection?.xml).toContain('has value')
    expect(flowSection?.xml).toContain('attribute')
    expect(flowSection?.xml).toContain('resolves to 3 elements')
    expect(flowSection?.xml).toContain('Capture visual baseline `dashboard-hero`')

    const md = renderPromptMarkdown(doc)
    expect(md).toContain('action="assert"')
  })
})

describe('renderPromptMarkdown — XML structure', () => {
  function assertBalanced(xml: string): void {
    const stack: string[] = []
    for (const m of xml.matchAll(/<(\/?)([a-z_]+)[^<>]*?(\/?)>/g)) {
      const [, closing, name, selfClosing] = m
      if (selfClosing) continue
      if (closing) {
        expect(stack.pop()).toBe(name)
      } else {
        stack.push(name as string)
      }
    }
    expect(stack).toEqual([])
  }

  it('produces balanced tags for a full flow', () => {
    const doc = buildPromptDocument(makePayload(networkFlow), {
      mode: 'prompt',
      framework: 'playwright-ts',
    })
    assertBalanced(renderPromptMarkdown(doc))
  })

  it('puts instructions last inside the root element', () => {
    const doc = buildPromptDocument(makePayload(loginFlow), { mode: 'prompt' })
    expect(doc.sections.at(-1)?.id).toBe('instructions')
    const md = renderPromptMarkdown(doc)
    expect(md.indexOf('<instructions>')).toBeGreaterThan(md.indexOf('<flow>'))
    expect(md.trimEnd().endsWith('</recospec_prompt>')).toBe(true)
  })

  it('escapes selector characters that would break the markup', () => {
    const flow: RecordedAction[] = [
      clickAction(
        0,
        'form > button[title="a&b"]',
        'Go',
        'https://example.com/page',
        'button',
        'css',
      ),
    ]
    const doc = buildPromptDocument(makePayload(flow, { startUrl: 'https://example.com/page' }), {
      mode: 'prompt',
    })
    const md = renderPromptMarkdown(doc)
    expect(md).toContain('form &gt; button[title=&quot;a&amp;b&quot;]')
    expect(md).not.toContain('form > button')
  })

  it.each([
    ['playwright-ts', 'pages/LoginPage.ts', 'tests/login-flow.spec.ts'],
    ['cypress', 'cypress/pages/LoginPage.js', 'cypress/e2e/login-flow.cy.js'],
    ['selenium-py', 'pages/login_page.py', 'tests/test_login_flow.py'],
    [
      'selenium-java',
      'src/main/java/pages/LoginPage.java',
      'src/test/java/tests/LoginFlowTest.java',
    ],
  ] as const)(
    'lists %s deliverables at framework-idiomatic paths',
    (framework, pagePath, testPath) => {
      const doc = buildPromptDocument(makePayload(loginFlow), { mode: 'prompt', framework })
      const md = renderPromptMarkdown(doc)
      expect(md).toContain(`path="${pagePath}"`)
      expect(md).toContain(`path="${testPath}"`)
    },
  )

  it('falls back to generic deliverables when no framework is known', () => {
    const doc = buildPromptDocument(makePayload(loginFlow), { mode: 'prompt' })
    expect(renderPromptMarkdown(doc)).toContain("the project's existing test framework")
  })
})

describe('buildPromptDocument — negative scenario rule', () => {
  it('tells Claude to derive invalid values from the env var when the flow expects an error', () => {
    const doc = buildPromptDocument(makePayload(loginFlow), {
      mode: 'prompt',
      framework: 'playwright-ts',
    })
    const md = renderPromptMarkdown(doc)
    expect(md).toContain('expects an error')
    expect(md).toContain('deliberately invalid')
    expect(md).toContain('never reuse the valid value')
  })

  it('omits the rule when the flow has no sensitive parameters', () => {
    const doc = buildPromptDocument(
      makePayload(searchFlow, { name: 'Search Flow', startUrl: 'https://example.com/search' }),
      { mode: 'prompt' },
    )
    expect(renderPromptMarkdown(doc)).not.toContain('deliberately invalid')
  })
})
