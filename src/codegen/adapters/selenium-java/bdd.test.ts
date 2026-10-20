import { describe, it, expect } from 'vitest'
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'
import { validateJavaSource } from './java-validate'
import type { IRElement, IRPage, IRScenario } from '../../ir/types'

const emailEl: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="email"]',
  tagName: 'input',
  inputType: 'email',
}
const passwordEl: IRElement = {
  name: 'passwordInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="password"]',
  tagName: 'input',
  inputType: 'password',
}
const submitEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="submit"]',
  tagName: 'button',
}

const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  steps: [
    { id: 's0', action: 'navigate', url: '/login' },
    { id: 's1', action: 'fill', element: emailEl, value: 'admin@example.com' },
    { id: 's2', action: 'fill', element: passwordEl, value: 'secret' },
    { id: 's3', action: 'click', element: submitEl },
  ],
  elements: [emailEl, passwordEl, submitEl],
  inferredMethods: [
    {
      name: 'login',
      params: ['email', 'password'],
      paramTypes: ['string', 'string'],
      steps: [
        { id: 's1', action: 'fill', element: emailEl, value: 'admin@example.com' },
        { id: 's2', action: 'fill', element: passwordEl, value: 'secret' },
        { id: 's3', action: 'click', element: submitEl },
      ],
    },
  ],
}

const scenario: IRScenario = { name: 'User can log in', pages: [loginPage] }

function parseFeature(content: string) {
  let counter = 0
  const parser = new Parser(
    new AstBuilder(() => String(++counter)),
    new GherkinClassicTokenMatcher(),
  )
  return parser.parse(content)
}

describe('renderFeatureFile (Selenium-Java BDD)', () => {
  it('produces a Gherkin-parsable .feature file', () => {
    const content = renderFeatureFile(scenario)
    const doc = parseFeature(content)
    expect(doc.feature?.name).toBe('User can log in')
    const sc = doc.feature?.children[0]?.scenario
    expect(sc?.name).toBe('User can log in')
    const stepKeywords = sc?.steps.map((s) => s.keyword.trim())
    expect(stepKeywords).toEqual(['Given', 'When'])
    expect(sc?.steps[1].text).toBe(
      'I log in with email "$RECOSPEC_EMAIL" and password "$RECOSPEC_PASSWORD"',
    )
  })

  it('feature header lists the scenario name', () => {
    const content = renderFeatureFile(scenario)
    expect(content).toMatch(/^Feature: User can log in/)
    expect(content).toMatch(/Scenario: User can log in/)
  })
})

describe('renderStepsFile (Selenium-Java BDD)', () => {
  it('imports io.cucumber.java.en Given/When/Then annotations', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('import io.cucumber.java.en.Given;')
    expect(content).toContain('import io.cucumber.java.en.When;')
    expect(content).toContain('import io.cucumber.java.en.Then;')
  })

  it('declares the package as `steps`', () => {
    const content = renderStepsFile(scenario)
    expect(content).toMatch(/^package steps;/)
  })

  it('imports POM via the pages.* package', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('import pages.LoginPage;')
  })

  it('keeps Cucumber Expression placeholders as native {string}/{int}', () => {
    const content = renderStepsFile(scenario)
    // Cucumber-JVM understands {string}/{int}/{float} natively — no conversion.
    expect(content).toMatch(/@Given\("I am on the \{string\} page"\)/)
    expect(content).toMatch(/@When\("I log in with email \{string\} and password \{string\}"\)/)
  })

  it('step body instantiates POM and calls the inferred method (no await — sync)', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('LoginPage loginPage = new LoginPage(driver);')
    expect(content).toContain('loginPage.login(secretValue(arg1), secretValue(arg2));')
    expect(content).not.toMatch(/\bawait\b/)
  })

  it('navigate step calls .goTo() on the page object (Java-cased)', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('loginPage.goTo();')
  })

  it('emits @Before / @After lifecycle and Chrome driver setup', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('import io.cucumber.java.Before;')
    expect(content).toContain('import io.cucumber.java.After;')
    expect(content).toContain('@Before')
    expect(content).toContain('@After')
    expect(content).toContain('new ChromeDriver(options)')
    expect(content).toContain('driver.quit()')
  })

  it('deduplicates repeated step patterns', () => {
    const repeating: IRScenario = {
      name: 'Repeat',
      pages: [loginPage, { ...loginPage }],
    }
    const content = renderStepsFile(repeating)
    const occurrences = content.match(/I log in with email/g) ?? []
    expect(occurrences.length).toBe(1)
  })

  it('types parameters as `int` when an {int} placeholder is present', () => {
    const countEl: IRElement = {
      name: 'itemList',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="items"]',
      tagName: 'ul',
    }
    const countPage: IRPage = {
      name: 'Inventory',
      className: 'InventoryPage',
      normalizedUrl: '/inventory',
      elements: [countEl],
      steps: [
        { id: 'n', action: 'navigate', url: '/inventory' },
        {
          id: 'a',
          action: 'assert',
          element: countEl,
          assertionDetail: { type: 'count', expected: 5 },
        },
      ],
    }
    const intScenario: IRScenario = { name: 'Inventory has items', pages: [countPage] }
    const content = renderStepsFile(intScenario)
    // The {int} placeholder must surface as a typed Java parameter.
    expect(content).toMatch(/int arg1/)
  })

  it('generated step file passes lightweight Java structural validation', () => {
    const result = validateJavaSource(renderStepsFile(scenario))
    if (!result.ok) {
      const summary = result.issues.map((i) => `  line ${i.line}: ${i.message}`).join('\n')
      throw new Error(`step file failed Java validation:\n${summary}`)
    }
    expect(result.ok).toBe(true)
  })

  it('CucumberRunner.java passes lightweight Java structural validation', () => {
    const files = renderBddScaffoldFiles()
    const runner = files.find((f) => f.filename === 'CucumberRunner.java')!
    const result = validateJavaSource(runner.content)
    expect(result.ok).toBe(true)
  })
})

describe('renderBddScaffoldFiles (Selenium-Java BDD)', () => {
  it('overrides pom.xml with Cucumber + JUnit5 deps and drops TestNG', () => {
    const files = renderBddScaffoldFiles()
    const pom = files.find((f) => f.filename === 'pom.xml')
    expect(pom).toBeDefined()
    expect(pom!.content).toContain('cucumber-java')
    expect(pom!.content).toContain('cucumber-junit-platform-engine')
    expect(pom!.content).toContain('junit-platform-suite')
    expect(pom!.content).not.toContain('<artifactId>testng</artifactId>')
    // Surefire stays but should not reference testng.xml.
    expect(pom!.content).not.toContain('<suiteXmlFile>testng.xml</suiteXmlFile>')
  })

  it('emits CucumberRunner.java wired to features/ resource and steps glue', () => {
    const files = renderBddScaffoldFiles()
    const runner = files.find((f) => f.filename === 'CucumberRunner.java')
    expect(runner).toBeDefined()
    expect(runner!.content).toMatch(/^package runners;/)
    expect(runner!.content).toContain('@Suite')
    expect(runner!.content).toContain('@IncludeEngines("cucumber")')
    expect(runner!.content).toContain('@SelectClasspathResource("features")')
    expect(runner!.content).toMatch(/GLUE_PROPERTY_NAME.*"steps"/)
  })

  it('emits junit-platform.properties (replaces testng.xml in BDD mode)', () => {
    const files = renderBddScaffoldFiles()
    const props = files.find((f) => f.filename === 'junit-platform.properties')
    expect(props).toBeDefined()
    expect(props!.content).toMatch(/cucumber\./)
  })
})
