import type { IRNetworkInfo } from '../../ir/types'

function urlPattern(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    return `**${u.pathname}${u.search}`
  } catch {
    return rawUrl
  }
}

function safeJsonExpression(body: string | undefined): string {
  if (!body) return `''`
  const trimmed = body.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return trimmed
    } catch {
      // fall through to string fallback
    }
  }
  return JSON.stringify(body)
}

export function renderMockBlock(net: IRNetworkInfo, indent: string): string {
  const pattern = urlPattern(net.url)
  const status = net.status ?? 200
  const contentType = net.contentType ?? 'application/json'
  const isJson = contentType.includes('json')
  const bodyExpr = isJson
    ? `JSON.stringify(${safeJsonExpression(net.responseBody)})`
    : JSON.stringify(net.responseBody ?? '')
  return `${indent}await page.route(${JSON.stringify(pattern)}, (route) => route.fulfill({
${indent}  status: ${status},
${indent}  contentType: ${JSON.stringify(contentType)},
${indent}  body: ${bodyExpr},
${indent}}));`
}
