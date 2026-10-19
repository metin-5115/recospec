import { describe, it, expect, vi } from 'vitest'
import ts from 'typescript'
import { PLAYWRIGHT_SELF_HEALING_TS, CYPRESS_SELF_HEALING_JS } from './self-healing'

/**
 * The helpers are what ships into the generated project, so these tests execute that source
 * (transpiled from TypeScript where needed) against small fakes of Playwright and Cypress.
 */

interface FakeLocator {
  readonly name: string
  or(other: FakeLocator): FakeLocator
  first(): FakeLocator
  waitFor(options: { state: string; timeout: number }): Promise<void>
  count(): Promise<number>
  toString(): string
}

interface FakeWorld {
  /** Names of the locators that currently exist on the page. */
  present: Set<string>
}

function fakeLocator(name: string, world: FakeWorld, alternatives: string[] = [name]): FakeLocator {
  return {
    name,
    or: (other) =>
      fakeLocator(`${name}|${other.name}`, world, [...alternatives, ...otherAlts(other)]),
    first: () => fakeLocator(`${name}.first()`, world, alternatives),
    waitFor: async () => {
      if (!world.present.has(name)) throw new Error('timeout')
    },
    count: async () => (world.present.has(name) ? 1 : 0),
    toString: () => `locator(${name})`,
  }
}

function otherAlts(l: FakeLocator): string[] {
  return l.name.split('|')
}

interface HealingModule {
  selfHealingLocator: (page: unknown, candidates: unknown[]) => FakeLocator
}

function loadPlaywrightHelper(warn: (message: string) => void): HealingModule {
  const js = ts.transpileModule(PLAYWRIGHT_SELF_HEALING_TS, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports: Record<string, unknown> = {}
  new Function('exports', 'require', 'console', js)(exports, () => ({}), { warn })
  return exports as unknown as HealingModule
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('Playwright selfHealingLocator (emitted source)', () => {
  function setup(present: string[]) {
    const world: FakeWorld = { present: new Set(present) }
    const warn = vi.fn()
    const helper = loadPlaywrightHelper(warn)
    const page = { locator: (sel: string) => fakeLocator(sel, world) }
    return { world, warn, helper, page }
  }

  it('combines the candidates into one locator, primary first', () => {
    const { helper, page } = setup(['primary'])
    const primary = fakeLocator('primary', { present: new Set() })
    const fallback = fakeLocator('fallback', { present: new Set() })
    const result = helper.selfHealingLocator(page, [primary, fallback])
    expect(result.name).toBe('primary|fallback.first()')
  })

  it('accepts plain selectors as candidates', () => {
    const { helper, page } = setup([])
    const result = helper.selfHealingLocator(page, ['#a', '#b'])
    expect(result.name).toBe('#a|#b.first()')
  })

  it('says nothing while the primary locator is on the page', async () => {
    const { helper, page, warn } = setup(['primary', 'fallback'])
    helper.selfHealingLocator(page, [page.locator('primary'), page.locator('fallback')])
    await flush()
    expect(warn).not.toHaveBeenCalled()
  })

  it('reports which fallback took over when the primary is gone', async () => {
    const { helper, page, warn } = setup(['fallback'])
    helper.selfHealingLocator(page, [page.locator('primary'), page.locator('fallback')])
    await flush()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('locator(fallback)')
  })

  it('stays quiet when nothing matches at all', async () => {
    const { helper, page, warn } = setup([])
    helper.selfHealingLocator(page, [page.locator('primary'), page.locator('fallback')])
    await flush()
    expect(warn).not.toHaveBeenCalled()
  })

  it('has nothing to heal with a single candidate', async () => {
    const { helper, page, warn } = setup([])
    const result = helper.selfHealingLocator(page, [page.locator('only')])
    await flush()
    expect(result.name).toBe('only.first()')
    expect(warn).not.toHaveBeenCalled()
  })

  it('refuses an empty candidate list', () => {
    const { helper, page } = setup([])
    expect(() => helper.selfHealingLocator(page, [])).toThrow(/no selectors/i)
  })
})

describe('Cypress cy.selfHealing (emitted source)', () => {
  interface Chain {
    should(fn: () => void): Chain
    then<T>(fn: () => T): T
  }

  function setup(present: string[]) {
    const registered: Record<string, (...args: unknown[]) => unknown> = {}
    const warn = vi.fn()
    const gets: string[] = []
    const chain: Chain = {
      should(fn) {
        fn()
        return chain
      },
      then: (fn) => fn(),
    }
    const cy = {
      wrap: () => chain,
      get: (selector: string) => {
        gets.push(selector)
        return selector
      },
    }
    const Cypress = {
      Commands: {
        add: (name: string, fn: (...args: unknown[]) => unknown) => {
          registered[name] = fn
        },
      },
      $: (selector: string) => (present.includes(selector) ? [1] : []),
      log: vi.fn(),
    }
    new Function('Cypress', 'cy', 'console', CYPRESS_SELF_HEALING_JS)(Cypress, cy, { warn })
    return { selfHealing: registered['selfHealing'], warn, gets }
  }

  it('uses the primary selector while it matches', () => {
    const { selfHealing, warn, gets } = setup(['#primary', '#fallback'])
    selfHealing?.(['#primary', '#fallback'])
    expect(gets).toEqual(['#primary'])
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back to the first selector that matches and says so', () => {
    const { selfHealing, warn, gets } = setup(['#fallback2'])
    selfHealing?.(['#primary', '#fallback1', '#fallback2'])
    expect(gets).toEqual(['#fallback2'])
    expect(String(warn.mock.calls[0]?.[0])).toContain('#fallback2')
  })

  it('fails with the list of selectors when none matches', () => {
    const { selfHealing } = setup([])
    expect(() => selfHealing?.(['#a', '#b'])).toThrow(/#a, #b/)
  })

  it('rejects an empty list', () => {
    const { selfHealing } = setup([])
    expect(() => selfHealing?.([])).toThrow(/non-empty array/)
  })
})
