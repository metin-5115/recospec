import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { LocatorEngine } from '@locator/index'
import type { LocatorBundle, LocatorStrategyName } from '@shared/types/locator'

export interface BenchmarkExpectation {
  name: string
  querySelector: string
  expectedStrategy?: LocatorStrategyName
  expectedSelector?: string
  minScore?: number
  forbiddenPrimaryStrategies?: LocatorStrategyName[]
}

export interface BenchmarkFixture {
  name: string
  description?: string
  htmlPath: string
  html: string
  entries: BenchmarkExpectation[]
}

export interface EntryFailure {
  fixture: string
  entry: string
  reason: string
}

export interface FixtureResult {
  fixture: string
  total: number
  passed: number
  successRate: number
  failures: EntryFailure[]
}

export function loadFixtures(rootDir: string): BenchmarkFixture[] {
  const dirEntries = readdirSync(rootDir, { withFileTypes: true })
  const fixtures: BenchmarkFixture[] = []
  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue
    const dir = join(rootDir, entry.name)
    const htmlPath = join(dir, 'snapshot.html')
    const expectedPath = join(dir, 'expected.json')
    let html: string
    let expectedRaw: string
    try {
      html = readFileSync(htmlPath, 'utf8')
      expectedRaw = readFileSync(expectedPath, 'utf8')
    } catch {
      continue
    }
    const parsed = JSON.parse(expectedRaw) as {
      description?: string
      entries: BenchmarkExpectation[]
    }
    fixtures.push({
      name: entry.name,
      description: parsed.description,
      htmlPath,
      html,
      entries: parsed.entries,
    })
  }
  return fixtures
}

export function evaluateFixture(
  fixture: BenchmarkFixture,
  engine: LocatorEngine = new LocatorEngine(),
): FixtureResult {
  const doc = new DOMParser().parseFromString(fixture.html, 'text/html')
  const failures: EntryFailure[] = []
  let passed = 0

  for (const entry of fixture.entries) {
    const el = doc.querySelector(entry.querySelector)
    if (!el) {
      failures.push({
        fixture: fixture.name,
        entry: entry.name,
        reason: `querySelector '${entry.querySelector}' did not match`,
      })
      continue
    }
    const bundle = engine.evaluate(el, doc)
    const result = checkEntry(entry, bundle)
    if (result.ok) {
      passed += 1
    } else {
      failures.push({ fixture: fixture.name, entry: entry.name, reason: result.reason })
    }
  }

  const total = fixture.entries.length
  const successRate = total === 0 ? 1 : passed / total
  return { fixture: fixture.name, total, passed, successRate, failures }
}

function checkEntry(
  entry: BenchmarkExpectation,
  bundle: LocatorBundle | null,
): { ok: true } | { ok: false; reason: string } {
  if (!bundle) return { ok: false, reason: 'engine returned null' }
  const primary = bundle.primary

  if (entry.expectedStrategy && primary.strategy !== entry.expectedStrategy) {
    return {
      ok: false,
      reason: `expected primary '${entry.expectedStrategy}', got '${primary.strategy}'`,
    }
  }

  if (entry.forbiddenPrimaryStrategies?.includes(primary.strategy)) {
    return {
      ok: false,
      reason: `primary strategy '${primary.strategy}' is in forbidden list`,
    }
  }

  if (typeof entry.minScore === 'number' && primary.score < entry.minScore) {
    return {
      ok: false,
      reason: `score ${primary.score} below minScore ${entry.minScore}`,
    }
  }

  if (entry.expectedSelector) {
    const actual = typeof primary.selector === 'string' ? primary.selector : ''
    if (actual !== entry.expectedSelector) {
      return {
        ok: false,
        reason: `expected selector '${entry.expectedSelector}', got '${actual}'`,
      }
    }
  }

  return { ok: true }
}
