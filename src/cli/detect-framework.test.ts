import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectFramework } from './detect-framework'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'playforge-detect-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('detectFramework', () => {
  it('picks selenium-java when pom.xml has the selenium-java artifact', () => {
    writeFileSync(
      join(tmp, 'pom.xml'),
      '<project><dependencies><dependency><groupId>org.seleniumhq.selenium</groupId><artifactId>selenium-java</artifactId><version>4</version></dependency></dependencies></project>',
    )
    expect(detectFramework(tmp)).toEqual({ framework: 'selenium-java', source: 'pom.xml' })
  })

  it('picks selenium-py when requirements.txt declares selenium', () => {
    writeFileSync(join(tmp, 'requirements.txt'), 'selenium==4.16\npytest==7\n')
    expect(detectFramework(tmp)).toEqual({ framework: 'selenium-py', source: 'requirements.txt' })
  })

  it('picks playwright-ts from package.json devDependencies', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({
        name: 'x',
        devDependencies: { '@playwright/test': '^1.51.0' },
      }),
    )
    expect(detectFramework(tmp)).toEqual({ framework: 'playwright-ts', source: 'package.json' })
  })

  it('picks cypress when package.json carries it', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'x', devDependencies: { cypress: '^13.6.0' } }),
    )
    expect(detectFramework(tmp)).toEqual({ framework: 'cypress', source: 'package.json' })
  })

  it('returns null when nothing matches', () => {
    expect(detectFramework(tmp)).toBeNull()
  })

  it('does not blow up on malformed package.json', () => {
    writeFileSync(join(tmp, 'package.json'), '{not json')
    expect(detectFramework(tmp)).toBeNull()
  })
})
