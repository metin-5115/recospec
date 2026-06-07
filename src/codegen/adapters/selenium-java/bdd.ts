import type { GeneratedFile } from '@shared/types/generated'
import type { IRScenario, IRPage } from '../../ir/types'
import {
  mapScenarioToGherkin,
  type GherkinStep,
  type GherkinFeature,
} from '../../bdd/gherkin-mapper'

// ---------------------------------------------------------------------------
// .feature renderer
// ---------------------------------------------------------------------------

function indentBlock(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length ? `${pad}${line}` : line))
    .join('\n')
}

export function renderFeatureFile(scenario: IRScenario): string {
  const feature: GherkinFeature = mapScenarioToGherkin(scenario)
  const scenarioBlocks = feature.scenarios.map((sc) => {
    const stepLines = sc.steps.map((s) => `${s.keyword} ${s.text}`).join('\n')
    return `Scenario: ${sc.name}\n${indentBlock(stepLines, 2)}`
  })
  return `Feature: ${feature.name}\n\n${indentBlock(scenarioBlocks.join('\n\n'), 2)}\n`
}

// ---------------------------------------------------------------------------
// Step body rendering
//
// Cucumber-JVM natively understands `{string}`, `{int}`, `{float}` — no
// pattern conversion needed. `{string}` arguments arrive without surrounding
// quotes (Cucumber strips them), so step bodies treat them as plain Java
// strings.
// ---------------------------------------------------------------------------

function pomVarName(page: IRPage): string {
  // LoginPage → loginPage (Java idiomatic local-variable name)
  return page.className.charAt(0).toLowerCase() + page.className.slice(1)
}

function javaTypeForPlaceholder(p: string): string {
  if (p === '{int}') return 'int'
  if (p === '{float}') return 'double'
  return 'String'
}

function placeholderTypes(pattern: string): string[] {
  return (pattern.match(/\{(string|int|float)\}/g) ?? []).map(javaTypeForPlaceholder)
}

function renderStepBody(step: GherkinStep, argNames: string[]): string {
  const page = step.page
  const method = step.method
  const sourceAction = step.sourceSteps[0]?.action

  if (page && method) {
    const pomName = pomVarName(page)
    const args = argNames.join(', ')
    return [
      `        ${page.className} ${pomName} = new ${page.className}(driver);`,
      `        ${pomName}.${method.name}(${args});`,
    ].join('\n')
  }

  if (sourceAction === 'navigate' && page) {
    const pomName = pomVarName(page)
    return [
      `        ${page.className} ${pomName} = new ${page.className}(driver);`,
      `        ${pomName}.goTo();`,
    ].join('\n')
  }

  if (sourceAction === 'click') {
    const ref = argNames[0] ?? '""'
    return [
      `        String xpath = "//*[normalize-space()='" + ${ref} + "']";`,
      `        driver.findElement(By.xpath(xpath)).click();`,
    ].join('\n')
  }
  if (sourceAction === 'fill') {
    const labelRef = argNames[0] ?? '""'
    const valueRef = argNames[1] ?? '""'
    return [
      `        String xpath = "//*[@aria-label='" + ${labelRef} + "' or @placeholder='" + ${labelRef} + "']";`,
      `        WebElement el = driver.findElement(By.xpath(xpath));`,
      `        el.clear();`,
      `        el.sendKeys(${valueRef});`,
    ].join('\n')
  }
  if (sourceAction === 'keypress') {
    const keyRef = argNames[0] ?? '""'
    return `        driver.switchTo().activeElement().sendKeys(Keys.valueOf(${keyRef}.toUpperCase()));`
  }
  if (sourceAction === 'assert') {
    const textRef = argNames[0] ?? '""'
    return [
      `        String xpath = "//*[contains(normalize-space(), '" + ${textRef} + "')]";`,
      `        assert driver.findElement(By.xpath(xpath)).isDisplayed();`,
    ].join('\n')
  }
  return `        // TODO: implement step`
}

// ---------------------------------------------------------------------------
// Steps file renderer
// ---------------------------------------------------------------------------

/**
 * Cucumber-JVM offers `@Given`/`@When`/`@Then` (plus `@And`/`@But`). `And`
 * lines in the feature are Gherkin sugar — registration uses the canonical
 * keyword of the preceding step, matching the heuristic used by the
 * Playwright/Cypress/selenium-py adapters.
 */
function canonicalAnnotation(step: GherkinStep): 'Given' | 'When' | 'Then' {
  if (step.keyword !== 'And') return step.keyword
  const text = step.text.toLowerCase()
  if (text.startsWith('i am on ')) return 'Given'
  if (text.startsWith('the ') || text.startsWith('i should ') || text.startsWith('i verify ')) {
    return 'Then'
  }
  return 'When'
}

export function renderStepsFile(scenario: IRScenario): string {
  const feature = mapScenarioToGherkin(scenario)
  const seenPatterns = new Set<string>()
  const stepMethods: string[] = []
  const pomImports = new Set<string>()
  let stepCounter = 0

  for (const sc of feature.scenarios) {
    for (const step of sc.steps) {
      if (seenPatterns.has(step.pattern)) continue
      seenPatterns.add(step.pattern)

      if (step.page) pomImports.add(step.page.className)

      const types = placeholderTypes(step.pattern)
      const argNames = types.map((_, i) => `arg${i + 1}`)
      const paramList = argNames.map((n, i) => `${types[i] ?? 'String'} ${n}`).join(', ')
      const annotation = canonicalAnnotation(step)
      stepCounter++
      const methodName = `step${stepCounter}`
      const body = renderStepBody(step, argNames)

      stepMethods.push(
        `    @${annotation}(${JSON.stringify(step.pattern)})\n` +
          `    public void ${methodName}(${paramList}) {\n${body}\n    }`,
      )
    }
  }

  const annotationImports = ['Given', 'When', 'Then']
    .map((k) => `import io.cucumber.java.en.${k};`)
    .join('\n')

  const pomImportLines = Array.from(pomImports)
    .sort()
    .map((name) => `import pages.${name};`)
    .join('\n')
  const pomImportBlock = pomImportLines ? `${pomImportLines}\n` : ''

  return `package steps;

import java.time.Duration;
import io.cucumber.java.Before;
import io.cucumber.java.After;
${annotationImports}
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.WebDriverWait;
${pomImportBlock}
public class StepDefinitions {
    private WebDriver driver;
    private WebDriverWait wait;

    @Before
    public void setUp() {
        ChromeOptions options = new ChromeOptions();
        if (!Boolean.parseBoolean(System.getProperty("headed", "false"))) {
            options.addArguments("--headless=new");
        }
        options.addArguments("--disable-gpu");
        options.addArguments("--window-size=1280,720");
        driver = new ChromeDriver(options);
        wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    @After
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }

${stepMethods.join('\n\n')}
}
`
}

// ---------------------------------------------------------------------------
// Cucumber Runner (JUnit Platform Suite — replaces testng.xml in BDD mode)
// ---------------------------------------------------------------------------

const CUCUMBER_RUNNER_JAVA = `package runners;

import org.junit.platform.suite.api.ConfigurationParameter;
import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectClasspathResource;
import org.junit.platform.suite.api.Suite;

import static io.cucumber.junit.platform.engine.Constants.GLUE_PROPERTY_NAME;
import static io.cucumber.junit.platform.engine.Constants.PLUGIN_PROPERTY_NAME;

@Suite
@IncludeEngines("cucumber")
@SelectClasspathResource("features")
@ConfigurationParameter(key = GLUE_PROPERTY_NAME, value = "steps")
@ConfigurationParameter(key = PLUGIN_PROPERTY_NAME, value = "pretty, summary, html:target/cucumber-report.html")
public class CucumberRunner {
}
`

const JUNIT_PLATFORM_PROPERTIES = `cucumber.publish.quiet=true
cucumber.execution.parallel.enabled=false
`

// ---------------------------------------------------------------------------
// pom.xml override (JUnit5 + Cucumber-JVM, drops TestNG)
// ---------------------------------------------------------------------------

const POM_XML_BDD = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.recospec</groupId>
    <artifactId>generated-tests</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <selenium.version>4.16.1</selenium.version>
        <cucumber.version>7.15.0</cucumber.version>
        <junit.platform.version>1.10.1</junit.platform.version>
        <webdrivermanager.version>5.6.3</webdrivermanager.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.seleniumhq.selenium</groupId>
            <artifactId>selenium-java</artifactId>
            <version>\${selenium.version}</version>
        </dependency>
        <dependency>
            <groupId>io.cucumber</groupId>
            <artifactId>cucumber-java</artifactId>
            <version>\${cucumber.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>io.cucumber</groupId>
            <artifactId>cucumber-junit-platform-engine</artifactId>
            <version>\${cucumber.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.junit.platform</groupId>
            <artifactId>junit-platform-suite</artifactId>
            <version>\${junit.platform.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>io.github.bonigarcia</groupId>
            <artifactId>webdrivermanager</artifactId>
            <version>\${webdrivermanager.version}</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.2.5</version>
            </plugin>
        </plugins>
    </build>
</project>
`

// ---------------------------------------------------------------------------
// BDD scaffold — overrides pom.xml, removes testng.xml, adds runner/properties
// ---------------------------------------------------------------------------

export function renderBddScaffoldFiles(): GeneratedFile[] {
  return [
    { filename: 'pom.xml', content: POM_XML_BDD },
    { filename: 'CucumberRunner.java', content: CUCUMBER_RUNNER_JAVA },
    { filename: 'junit-platform.properties', content: JUNIT_PLATFORM_PROPERTIES },
  ]
}
