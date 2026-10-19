import type { AssertionDetail } from '../../ir/types'
import { urlAssertionPattern } from '../../shared/url-assertion'

/** Render one assertion against an already-built Cypress chain (`cy.get(...)`). */
export function renderAssertion(d: AssertionDetail, chain: string, indent: string): string {
  switch (d.type) {
    case 'visible':
      return `${indent}${chain}.should('be.visible');`
    case 'hidden':
      return `${indent}${chain}.should('not.be.visible');`
    case 'text':
      return `${indent}${chain}.should('have.text', ${JSON.stringify(d.expected ?? '')});`
    case 'text-contains':
      return `${indent}${chain}.should('contain.text', ${JSON.stringify(d.expected ?? '')});`
    case 'not-empty':
      return `${indent}${chain}.invoke('text').should('not.be.empty');`
    case 'matches':
      return `${indent}${chain}.invoke('text').should('match', new RegExp(${JSON.stringify(String(d.expected ?? ''))}));`
    case 'value':
      return `${indent}${chain}.should('have.value', ${JSON.stringify(d.expected ?? '')});`
    case 'attribute':
      return `${indent}${chain}.should('have.attr', ${JSON.stringify(d.attribute ?? '')}, ${JSON.stringify(d.expected ?? '')});`
    case 'count':
      return `${indent}${chain}.should('have.length', ${Number(d.expected ?? 0)});`
    case 'url': {
      const pattern = urlAssertionPattern(String(d.expected ?? ''))
      return pattern.kind === 'contains'
        ? `${indent}cy.url().should('include', ${JSON.stringify(pattern.value)});`
        : `${indent}cy.url().should('match', new RegExp(${JSON.stringify(pattern.source)}));`
    }
    case 'screenshot': {
      const name = d.name ?? 'snapshot'
      const pct = Math.round((d.threshold ?? 0.02) * 100) / 100
      return `${indent}${chain}.matchImageSnapshot(${JSON.stringify(name)}, { failureThreshold: ${pct}, failureThresholdType: 'percent' });`
    }
  }
}
