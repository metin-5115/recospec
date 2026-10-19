import { describe, it, expect, beforeEach } from 'vitest'
import { LocatorEngine } from './index'

const engine = new LocatorEngine()

beforeEach(() => {
  document.body.innerHTML = `
    <section><h2>Checkout</h2>
      <button id="pay" data-testid="pay" aria-label="Pay now">Pay</button>
    </section>`
})

describe('deferred fingerprint', () => {
  it('leaves the fingerprint out of the bundle when asked, keeping the locators', () => {
    const pay = document.getElementById('pay') as HTMLElement
    const full = engine.evaluate(pay, document)
    const deferred = engine.evaluate(pay, document, { deferFingerprint: true })

    expect(full?.fingerprint).toBeDefined()
    expect(deferred?.fingerprint).toBeUndefined()
    expect(deferred?.primary).toEqual(full?.primary)
    expect(deferred?.fallbacks).toEqual(full?.fallbacks)
  })

  it('builds the same fingerprint later through fingerprintFor', () => {
    const pay = document.getElementById('pay') as HTMLElement
    const full = engine.evaluate(pay, document)
    expect(engine.fingerprintFor(pay, document)).toEqual(full?.fingerprint)
  })
})
