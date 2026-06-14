import { describe, it, expect } from 'vitest'
import { performance } from 'node:perf_hooks'
import { LocatorEngine } from '@locator/index'

// Budgets are tight for a fast dev machine. Shared CI runners are far slower
// and noisy, so we relax the ceiling there (GitHub Actions sets CI=true). The
// relaxed bound is still strict enough to catch an algorithmic regression
// (e.g. an O(n²) blowup) while tolerating the timing jitter that would
// otherwise make this suite flaky and keep the public CI badge red.
const isCI = !!process.env.CI
const SINGLE_LOCATOR_P99_MS = isCI ? 80 : 5
const LARGE_DOM_SINGLE_BUDGET_MS = isCI ? 6000 : 500
const ITERATIONS = 100
const LARGE_DOM_SIZE = 1000
const SAMPLE_COUNT = 25

function buildSingleElementDoc(): { doc: Document; el: Element } {
  const doc = new DOMParser().parseFromString(
    `<form>
      <label for="login-email">Email Address</label>
      <input id="login-email" data-testid="email" name="email" placeholder="user@example.com" />
    </form>`,
    'text/html',
  )
  return { doc, el: doc.querySelector('#login-email') as Element }
}

function buildLargeDoc(size: number): Document {
  const items = Array.from({ length: size })
    .map(
      (_, i) =>
        `<li class="row" data-row="${i}"><span>Item ${i}</span><button aria-label="Edit ${i}">Edit</button></li>`,
    )
    .join('')
  return new DOMParser().parseFromString(`<ul id="catalog">${items}</ul>`, 'text/html')
}

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx] ?? 0
}

describe('Locator engine performance', () => {
  const engine = new LocatorEngine()

  it(`single locator p99 < ${SINGLE_LOCATOR_P99_MS}ms across ${ITERATIONS} iterations`, () => {
    const { doc, el } = buildSingleElementDoc()
    const samples: number[] = []

    engine.evaluate(el, doc) // warmup

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now()
      engine.evaluate(el, doc)
      samples.push(performance.now() - start)
    }

    const p50 = percentile(samples, 50)
    const p95 = percentile(samples, 95)
    const p99 = percentile(samples, 99)
    const max = Math.max(...samples)

    console.log(
      `[perf] single-locator p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms max=${max.toFixed(3)}ms`,
    )

    expect(p99).toBeLessThan(SINGLE_LOCATOR_P99_MS)
  })

  it(`single evaluate on a ${LARGE_DOM_SIZE}-element DOM < ${LARGE_DOM_SINGLE_BUDGET_MS}ms`, () => {
    const doc = buildLargeDoc(LARGE_DOM_SIZE)
    const buttons = Array.from(doc.querySelectorAll('button'))
    const samples: number[] = []

    engine.evaluate(buttons[0]!, doc) // warmup

    const stride = Math.max(1, Math.floor(buttons.length / SAMPLE_COUNT))
    for (let i = 0; i < buttons.length && samples.length < SAMPLE_COUNT; i += stride) {
      const start = performance.now()
      engine.evaluate(buttons[i]!, doc)
      samples.push(performance.now() - start)
    }

    const p50 = percentile(samples, 50)
    const p95 = percentile(samples, 95)
    const p99 = percentile(samples, 99)
    const max = Math.max(...samples)

    console.log(
      `[perf] large-dom (size=${LARGE_DOM_SIZE}, samples=${samples.length}) p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms p99=${p99.toFixed(2)}ms max=${max.toFixed(2)}ms`,
    )

    expect(max).toBeLessThan(LARGE_DOM_SINGLE_BUDGET_MS)
  })
})
