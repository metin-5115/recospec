import type { GeneratedFile } from '@shared/types/generated'
import { isUrlAssertionStep } from '../../shared/page-assertion'
import type { IRScenario, IRPage } from '../../ir/types'
import type { RenderOptions } from '../registry'
import { javaPackages } from './packages'
import {
  mapScenarioToGherkin,
  literalArgsFor,
  UPLOAD_FILE_SEPARATOR,
  type GherkinStep,
} from '../../bdd/gherkin-mapper'
import { UPLOAD_FIXTURES_DIR } from '../../shared/upload-fixtures'
import { FEATURE_SECRET_REF_PREFIX, SECRET_PARAM_DEFAULT_VALUE } from '@shared/constants'
import { resolveSecretArgs } from '../../bdd/secret-args'

export { renderFeatureFile } from '../../bdd/feature-file'

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

/** Recorded steps that need no step-definition code of their own. */
const NO_OP_ACTIONS = new Set(['wait', 'network'])

function renderStepBody(step: GherkinStep, argNames: string[]): string {
  const page = step.page
  const method = step.method
  const sourceAction = step.sourceSteps[0]?.action

  if (page && method) {
    const pomName = pomVarName(page)
    const args = [...argNames, ...literalArgsFor(step, argNames.length, 'java')].join(', ')
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
  if (sourceAction === 'select') {
    const valueRef = argNames[0] ?? '""'
    const labelRef = argNames[1] ?? '""'
    return [
      `        String xpath = "//*[@aria-label='" + ${labelRef} + "' or @name='" + ${labelRef} + "']";`,
      `        new Select(driver.findElement(By.xpath(xpath))).selectByValue(${valueRef});`,
    ].join('\n')
  }
  if (sourceAction === 'check' || sourceAction === 'uncheck') {
    const labelRef = argNames[0] ?? '""'
    const condition = sourceAction === 'check' ? '!el.isSelected()' : 'el.isSelected()'
    return [
      `        String xpath = "//*[@aria-label='" + ${labelRef} + "' or @name='" + ${labelRef} + "']";`,
      `        WebElement el = driver.findElement(By.xpath(xpath));`,
      `        if (${condition}) {`,
      `            el.click();`,
      `        }`,
    ].join('\n')
  }
  if (sourceAction === 'upload') {
    const filesRef = argNames[0] ?? '""'
    const labelRef = argNames[1] ?? '""'
    const toPath = `file -> java.nio.file.Paths.get("${UPLOAD_FIXTURES_DIR}", file).toAbsolutePath().toString()`
    return [
      `        String xpath = "//*[@aria-label='" + ${labelRef} + "' or @name='" + ${labelRef} + "']";`,
      `        String paths = java.util.Arrays.stream(${filesRef}.split(${JSON.stringify(UPLOAD_FILE_SEPARATOR)})).map(${toPath}).collect(java.util.stream.Collectors.joining("\\n"));`,
      `        driver.findElement(By.xpath(xpath)).sendKeys(paths);`,
    ].join('\n')
  }
  if (sourceAction === 'hover' || sourceAction === 'dblclick') {
    const textRef = argNames[0] ?? '""'
    const call = sourceAction === 'hover' ? 'moveToElement(el)' : 'doubleClick(el)'
    return [
      `        String xpath = "//*[normalize-space()='" + ${textRef} + "']";`,
      `        WebElement el = driver.findElement(By.xpath(xpath));`,
      `        new Actions(driver).${call}.perform();`,
    ].join('\n')
  }
  if (sourceAction === 'keypress') {
    const keyRef = argNames[0] ?? '""'
    return `        driver.switchTo().activeElement().sendKeys(Keys.valueOf(${keyRef}.toUpperCase()));`
  }
  if (sourceAction === 'assert' && isUrlAssertionStep(step)) {
    return `        new WebDriverWait(driver, Duration.ofSeconds(10)).until(d -> d.getCurrentUrl().contains(${argNames[0] ?? '""'}));`
  }
  if (sourceAction === 'assert') {
    const textRef = argNames[0] ?? '""'
    return [
      `        String xpath = "//*[contains(normalize-space(), '" + ${textRef} + "')]";`,
      `        assert driver.findElement(By.xpath(xpath)).isDisplayed();`,
    ].join('\n')
  }
  if (sourceAction && NO_OP_ACTIONS.has(sourceAction)) {
    return `        // No-op: ${sourceAction} steps are covered by the explicit waits.`
  }
  return `        throw new UnsupportedOperationException(${JSON.stringify(`Unsupported recorded step: ${sourceAction ?? 'unknown'}`)});`
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

/** Turns the `$ENV_VAR` a feature holds for a secret into the variable's value. */
const SECRET_VALUE_HELPER = `    private static String secretValue(String ref) {
        if (!ref.startsWith(${JSON.stringify(FEATURE_SECRET_REF_PREFIX)})) {
            return ref;
        }
        return System.getenv().getOrDefault(ref.substring(1), ${JSON.stringify(SECRET_PARAM_DEFAULT_VALUE)});
    }`

export function renderStepsFile(scenario: IRScenario, options: RenderOptions = {}): string {
  const feature = mapScenarioToGherkin(scenario)
  const seenPatterns = new Set<string>()
  const stepMethods: string[] = []
  const pomImports = new Set<string>()
  let usesSecrets = false
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
      usesSecrets ||= Boolean(step.secrets?.some(Boolean))
      const body = renderStepBody(
        step,
        resolveSecretArgs(step, argNames, (n) => `secretValue(${n})`),
      )

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
    .map((name) => `import ${javaPackages(options.dirs).pages}.${name};`)
    .join('\n')
  const pomImportBlock = pomImportLines ? `${pomImportLines}\n` : ''

  // Interaction-only imports are added when a generated body actually uses them.
  const stepsText = stepMethods.join('\n')
  const interactionImports = [
    /\bnew Actions\(/.test(stepsText) ? 'import org.openqa.selenium.interactions.Actions;' : '',
    /\bnew Select\(/.test(stepsText) ? 'import org.openqa.selenium.support.ui.Select;' : '',
  ]
    .filter(Boolean)
    .map((line) => `${line}\n`)
    .join('')

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
${interactionImports}${pomImportBlock}
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

${usesSecrets ? `${SECRET_VALUE_HELPER}\n\n` : ''}${stepMethods.join('\n\n')}
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
