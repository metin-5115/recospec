import { describe, it, expect } from 'vitest'
import { normalizeActions } from './normalizer/action-normalizer'
import { groupIntoPages } from './planner/page-grouper'
import { buildPromptDocument, renderPromptMarkdown } from './export/prompt-export'
import type { JsonExportPayload } from './export/json-export'
import recording from './__fixtures__/real-checkout-recording.json'

/**
 * A five-page, 36-action checkout captured by the real extension (single-page app, labelled form
 * controls, repeated product cards). It is the shape long real flows have and short hand-written
 * fixtures never did: routes that change without a navigate step, <label>-wrapped inputs with no
 * aria-label, and payment fields.
 */
function load(): JsonExportPayload {
  return JSON.parse(JSON.stringify(recording)) as JsonExportPayload
}

function pagesOf(payload: JsonExportPayload) {
  const { flatSteps } = normalizeActions(payload.actions)
  return groupIntoPages(flatSteps, payload.session.startUrl)
}

describe('real recording — checkout flow', () => {
  it('splits the single-page app into one page object per route', () => {
    expect(pagesOf(load()).map((p) => p.className)).toEqual([
      'ShopPage',
      'CartPage',
      'CheckoutPage',
      'PaymentPage',
    ])
  })

  it('names elements from their accessible names, never inputInput3', () => {
    const names = pagesOf(load()).flatMap((p) => p.elements.map((e) => e.name))
    expect(names).toEqual(
      expect.arrayContaining([
        'trailRunnerSizeSelect',
        'trailRunnerQuantityInput',
        'trailRunnerAddToCartButton',
        'canvasToteAddToCartButton',
        'cartLink',
        'promoCodeInput',
        'fullNameInput',
        'emailInput',
        'postalCodeInput',
        'countrySelect',
        'expressRadio',
        'giftWrapCheckbox',
        'deliveryNotesInput',
        'cardNumberInput',
        'cvvInput',
        'placeOrderButton',
      ]),
    )
    expect(names.filter((n) => /^input(Input)?\d*$/.test(n))).toEqual([])
    expect(names.filter((n) => /sml/i.test(n))).toEqual([])
  })

  it('marks every payment field sensitive and keeps the values out of the prompt', () => {
    const md = renderPromptMarkdown(
      buildPromptDocument(load(), { mode: 'prompt', framework: 'playwright-ts' }),
    )
    for (const env of ['RECOSPEC_EMAIL', 'RECOSPEC_CARD_NUMBER', 'RECOSPEC_CVV']) {
      expect(md).toContain(`[REDACTED:${env}]`)
    }
    expect(md).not.toContain('4242 4242 4242 4242')
    expect(md).not.toContain('customer@recospec.test')
    // The cardholder name is not payment card data.
    expect(md).toContain('value="Ada Lovelace"')
  })

  it('produces no placeholder method names', () => {
    const methods = pagesOf(load()).flatMap((p) => (p.inferredMethods ?? []).map((m) => m.name))
    expect(methods).not.toContain('doAction')
    expect(methods.filter((m) => /Input\d|inputInput/.test(m))).toEqual([])
  })
})
