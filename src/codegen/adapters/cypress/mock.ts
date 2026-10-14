import type { IRNetworkInfo, IRStep } from '../../ir/types'
import { jsSingleQuoted } from '@shared/selector-escape'

/**
 * Cypress network mocks. Module state is flipped by `applyOptions` so the
 * default output (and every existing snapshot) is unchanged until the user
 * opts in with "Include mocks for captured network requests".
 */
let RENDER_MOCKS = false

export function setCypressRenderMocks(value: boolean): void {
  RENDER_MOCKS = value
}

const DEFAULT_CONTENT_TYPE = 'application/json'
const DEFAULT_STATUS = 200

interface RouteMatcher {
  method: string
  pathname: string
  query: Array<[string, string]>
}

function matcherFor(net: IRNetworkInfo): RouteMatcher | null {
  try {
    const url = new URL(net.url)
    const query: Array<[string, string]> = []
    url.searchParams.forEach((value, key) => {
      const existing = query.findIndex(([k]) => k === key)
      if (existing === -1) query.push([key, value])
      else query[existing] = [key, value]
    })
    return { method: net.method.toUpperCase(), pathname: url.pathname, query }
  } catch {
    return null
  }
}

/** A JSON body is emitted as a live literal; anything else as a string literal. */
function bodyExpression(net: IRNetworkInfo, contentType: string): string {
  const raw = net.responseBody ?? ''
  if (contentType.includes('json')) {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed)
        return trimmed
      } catch {
        // Truncated at the capture cap — keep it as an inert string.
      }
    }
  }
  return JSON.stringify(raw)
}

const IDENTIFIER_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Object-literal key: bare when it is a valid identifier, quoted otherwise. */
function propertyKey(key: string): string {
  return IDENTIFIER_KEY.test(key) ? key : jsSingleQuoted(key)
}

function renderOne(net: IRNetworkInfo, matcher: RouteMatcher, indent: string): string {
  const contentType = net.contentType ?? DEFAULT_CONTENT_TYPE
  const parts = [
    `method: ${jsSingleQuoted(matcher.method)}`,
    `pathname: ${jsSingleQuoted(matcher.pathname)}`,
  ]
  if (matcher.query.length > 0) {
    const entries = matcher.query.map(([k, v]) => `${propertyKey(k)}: ${jsSingleQuoted(v)}`)
    parts.push(`query: { ${entries.join(', ')} }`)
  }
  return [
    `${indent}cy.intercept({ ${parts.join(', ')} }, {`,
    `${indent}  statusCode: ${net.status ?? DEFAULT_STATUS},`,
    `${indent}  headers: { 'content-type': ${jsSingleQuoted(contentType)} },`,
    `${indent}  body: ${bodyExpression(net, contentType)},`,
    `${indent}});`,
  ].join('\n')
}

/**
 * `cy.intercept` blocks for the captured network steps, de-duplicated by
 * method + path + query. They must be registered BEFORE the actions that
 * trigger the requests, so callers place the result at the start of a test or
 * method. Returns an empty string when mocks are disabled.
 */
export function renderCypressMocks(steps: readonly IRStep[], indent: string): string {
  if (!RENDER_MOCKS) return ''
  const seen = new Set<string>()
  const blocks: string[] = []
  for (const step of steps) {
    if (step.action !== 'network' || !step.network) continue
    const matcher = matcherFor(step.network)
    if (!matcher) continue
    const key = JSON.stringify([matcher.method, matcher.pathname, matcher.query])
    if (seen.has(key)) continue
    seen.add(key)
    blocks.push(renderOne(step.network, matcher, indent))
  }
  return blocks.join('\n')
}
