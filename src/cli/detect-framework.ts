import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FrameworkId } from '@shared/types/generated'

export interface DetectionResult {
  framework: FrameworkId
  source: string
}

/**
 * Walk the target project and pick the framework whose marker file is most
 * specific. Detection order (highest specificity first):
 *   1. pom.xml          → selenium-java  (presence of `selenium-java` artifact)
 *   2. requirements.txt → selenium-py    (presence of `selenium` + `pytest`)
 *   3. package.json     → cypress | playwright-ts (via devDependencies)
 *
 * Returns `null` when nothing matches — the caller falls back to an explicit
 * `--framework` flag or aborts with a clear error.
 */
export function detectFramework(projectDir: string): DetectionResult | null {
  const pom = resolve(projectDir, 'pom.xml')
  if (existsSync(pom)) {
    const xml = readFileSync(pom, 'utf8')
    if (/<artifactId>selenium-java<\/artifactId>/.test(xml)) {
      return { framework: 'selenium-java', source: 'pom.xml' }
    }
  }

  const req = resolve(projectDir, 'requirements.txt')
  if (existsSync(req)) {
    const txt = readFileSync(req, 'utf8')
    if (/^\s*selenium(\b|[=<>])/m.test(txt)) {
      return { framework: 'selenium-py', source: 'requirements.txt' }
    }
  }

  const pkg = resolve(projectDir, 'package.json')
  if (existsSync(pkg)) {
    try {
      const json = JSON.parse(readFileSync(pkg, 'utf8')) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const deps = { ...json.dependencies, ...json.devDependencies }
      if (deps['@playwright/test']) {
        return { framework: 'playwright-ts', source: 'package.json' }
      }
      if (deps['cypress']) {
        return { framework: 'cypress', source: 'package.json' }
      }
    } catch {
      // malformed package.json — fall through
    }
  }

  return null
}
