import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocatorEngine } from '@locator/index'
import { resolveLocator } from '@locator/pipeline/resolve'
import { normalizeClickTarget } from '@/content/normalize-click-target'
import type { ScoredLocator } from '@shared/types/locator'

/**
 * End-to-end oracle for the interlinked HTML harness pages. Every page annotates
 * its testable elements with the locator the engine is EXPECTED to produce:
 *
 *   data-expect="<strategy>"   primary strategy id must equal this
 *   data-expect-min="<n>"      primary score must be >= n
 *   data-expect-self           primary must resolve to exactly this element
 *   data-expect-pw="a|b"       Playwright expression must contain each substring
 *   data-expect-absent="x|y"   none of these must appear anywhere in the locator
 *   data-promote="<tag>"       a click on this leaf must first promote to <tag>;
 *                              the locator is then built on the promoted element
 *   data-expect-relative       (xpath only) must be relative, not body-rooted
 *
 * The spec parses each page, runs the real engine, and asserts the result — so a
 * page is "wrong" exactly when the engine stops behaving as documented.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const engine = new LocatorEngine()

function parsePage(file: string): Document {
  const html = readFileSync(join(HERE, file), 'utf8')
  return new DOMParser().parseFromString(html, 'text/html')
}

const PAGES = readdirSync(HERE)
  .filter((f) => f.endsWith('.html'))
  .sort()

/** Everything the engine emitted for one element, flattened to searchable text. */
function locatorText(loc: ScoredLocator): string {
  return [
    loc.selector,
    loc.framework?.playwright,
    loc.framework?.cypress,
    loc.framework?.seleniumPy,
  ]
    .filter(Boolean)
    .join('\n')
}

function describeCase(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const label =
    el.getAttribute('data-expect-pw') ??
    el.getAttribute('aria-label') ??
    (el.textContent ?? '').trim().slice(0, 30)
  return `<${tag}> ${label}`
}

describe('locator harness pages', () => {
  it('discovers all eight pages', () => {
    expect(PAGES.length).toBe(8)
  })

  for (const page of PAGES) {
    describe(page, () => {
      const doc = parsePage(page)
      const annotated = Array.from(
        doc.querySelectorAll<HTMLElement>('[data-expect], [data-promote]'),
      )

      it(`has annotated targets (${page})`, () => {
        expect(annotated.length).toBeGreaterThan(0)
      })

      for (const el of annotated) {
        it(`${describeCase(el)}`, () => {
          // --- Stage 0: click-target promotion (capture-side) ---
          let target: Element = el
          const promoteTag = el.getAttribute('data-promote')
          if (promoteTag) {
            target = normalizeClickTarget(el)
            expect(
              target.tagName.toLowerCase(),
              `expected click on <${el.tagName.toLowerCase()}> to promote to <${promoteTag}>`,
            ).toBe(promoteTag.toLowerCase())
          }

          const expectStrategy = el.getAttribute('data-expect')
          if (!expectStrategy) return // promotion-only assertion

          const bundle = engine.evaluate(target, doc)
          expect(bundle, 'engine returned no bundle').not.toBeNull()
          const primary = bundle!.primary
          const text = locatorText(primary)

          // --- strategy ---
          expect(
            primary.strategy,
            `primary was ${primary.strategy} (${primary.selector}); score ${primary.score}`,
          ).toBe(expectStrategy)

          // --- score floor ---
          const min = el.getAttribute('data-expect-min')
          if (min !== null) {
            expect(
              primary.score,
              `score ${primary.score} below floor ${min}`,
            ).toBeGreaterThanOrEqual(Number(min))
          }

          // --- resolves to exactly the (promoted) element ---
          if (el.hasAttribute('data-expect-self')) {
            const matches = resolveLocator(primary, doc)
            expect(matches, `resolved to ${matches.length} elements`).toEqual([target])
          }

          // --- required substrings in the Playwright expression ---
          const pw = el.getAttribute('data-expect-pw')
          if (pw) {
            for (const needle of pw.split('|')) {
              expect(text, `expected locator to contain "${needle}"\n${text}`).toContain(needle)
            }
          }

          // --- forbidden substrings (dynamic-value / framework-class leakage) ---
          const absent = el.getAttribute('data-expect-absent')
          if (absent) {
            for (const needle of absent.split('|')) {
              expect(text, `locator must not contain "${needle}"\n${text}`).not.toContain(needle)
            }
          }

          // --- xpath last resort must be relative, not body-rooted ---
          if (el.hasAttribute('data-expect-relative')) {
            expect(primary.warning, 'xpath should not be flagged absolute').not.toBe(
              'absolute-xpath',
            )
            expect(
              String(primary.selector).startsWith('/html'),
              `xpath should be relative-scoped, got ${primary.selector}`,
            ).toBe(false)
          }
        })
      }
    })
  }
})
