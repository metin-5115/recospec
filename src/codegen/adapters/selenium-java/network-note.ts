import type { IRStep } from '../../ir/types'

/**
 * Core Selenium cannot intercept or mock network traffic. When the user asked
 * for mocks, say so in the generated test and list what was recorded instead
 * of silently dropping the option.
 */
let INCLUDE_MOCKS = false

export function setSeleniumJavaIncludeMocks(value: boolean): void {
  INCLUDE_MOCKS = value
}

function pathOf(url: string): string {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}`
  } catch {
    return url
  }
}

/** Comment block (newline-terminated) listing the unmocked requests, or ''. */
export function renderNetworkNote(steps: readonly IRStep[], indent: string): string {
  if (!INCLUDE_MOCKS) return ''
  const seen = new Set<string>()
  const lines: string[] = []
  for (const step of steps) {
    if (step.action !== 'network' || !step.network) continue
    const line = `${step.network.method.toUpperCase()} ${pathOf(step.network.url)} -> ${step.network.status ?? '?'}`
    if (seen.has(line)) continue
    seen.add(line)
    lines.push(`${indent}//   ${line}`)
  }
  if (lines.length === 0) return ''
  const header = `${indent}// Not mocked — Selenium cannot intercept network traffic. Requests captured while recording:`
  return [header, ...lines].join('\n') + '\n'
}
