import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OUTPUT_DIRS,
  dottedModule,
  javaPackage,
  normalizeOutputDir,
  relativeModule,
  resolveOutputDirs,
} from './output-layout'

describe('resolveOutputDirs', () => {
  it('uses each framework default when nothing is configured', () => {
    expect(resolveOutputDirs('playwright-ts')).toEqual(DEFAULT_OUTPUT_DIRS['playwright-ts'])
    expect(resolveOutputDirs('cypress')).toEqual({
      pages: 'cypress/pages',
      tests: 'cypress/e2e',
      features: 'cypress/e2e',
    })
    expect(resolveOutputDirs('selenium-java').pages).toBe('src/main/java/pages')
  })

  it('overrides only the folders that were configured', () => {
    expect(resolveOutputDirs('playwright-ts', { testsDir: 'e2e/specs' })).toEqual({
      pages: 'pages',
      tests: 'e2e/specs',
      features: 'features',
    })
  })

  it('treats blank settings as unset', () => {
    expect(resolveOutputDirs('selenium-py', { pagesDir: '  ', testsDir: '' }).pages).toBe('pages')
  })
})

describe('normalizeOutputDir', () => {
  it.each([
    ['e2e/pages', 'e2e/pages'],
    ['./e2e/pages/', 'e2e/pages'],
    ['e2e\\pages', 'e2e/pages'],
    ['  tests  ', 'tests'],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeOutputDir(input)).toBe(expected)
  })

  it.each(['../outside', 'a/../../b', '/etc', 'C:/temp', '.'])('rejects %j', (input) => {
    expect(() => normalizeOutputDir(input)).toThrow(/relative folder inside the project/)
  })
})

describe('import helpers', () => {
  it('builds a relative module specifier between two folders', () => {
    expect(relativeModule('tests', 'pages', 'LoginPage')).toBe('../pages/LoginPage')
    expect(relativeModule('tests/e2e', 'pages', 'LoginPage')).toBe('../../pages/LoginPage')
    expect(relativeModule('e2e', 'e2e/pages', 'LoginPage')).toBe('./pages/LoginPage')
    expect(relativeModule('e2e', 'e2e', 'LoginPage')).toBe('./LoginPage')
  })

  it('turns a folder into a dotted Python module path', () => {
    expect(dottedModule('pages')).toBe('pages')
    expect(dottedModule('src/app/pages')).toBe('src.app.pages')
  })

  it('derives a Java package from a folder under the source root', () => {
    expect(javaPackage('src/main/java/pages', 'src/main/java')).toBe('pages')
    expect(javaPackage('src/main/java/com/acme/pages', 'src/main/java')).toBe('com.acme.pages')
  })

  it('refuses a Java folder outside the source root', () => {
    expect(() => javaPackage('app/pages', 'src/main/java')).toThrow(/src\/main\/java/)
  })
})
