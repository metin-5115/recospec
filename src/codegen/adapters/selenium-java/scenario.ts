import type { IRScenario, IRStep, AssertionDetail, IRElement, TestDataConfig } from '../../ir/types'
import { renderByExpression, javaStr } from './locator'
import { renderJavaInteraction, javaInteractionImports } from './interaction'
import { renderNetworkNote } from './network-note'
import {
  DEFAULT_SCREENSHOT_THRESHOLD,
  frameStatements,
  javaContextImports,
  newContextState,
  renderContextHelpers,
  screenshotName,
} from './context'
import { resolveTestData } from '../../planner/test-data-resolver'

let TEST_DATA: TestDataConfig | undefined
export function setSeleniumJavaTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

function renderFillValueExpr(el: IRElement | undefined, recordedValue: string): string {
  const r = resolveTestData(el, recordedValue, TEST_DATA)
  if (!r.useEnvVar) return javaStr(r.literal)
  return `System.getenv().getOrDefault(${javaStr(r.envVarName)}, ${javaStr(r.defaultValue)})`
}

/** Convert a recorded scenario name to a valid Java method name suffix. */
export function toJavaMethodName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, ' ').trim()
  if (!cleaned) return 'flow'
  const parts = cleaned.split(/\s+/)
  return parts
    .map((p, i) =>
      i === 0
        ? p.charAt(0).toLowerCase() + p.slice(1).toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
    )
    .join('')
}

/** Convert a class name (LoginPage) to a camelCase variable name (loginPage). */
function toVarName(className: string): string {
  return className.charAt(0).toLowerCase() + className.slice(1)
}

function renderAssertion(d: AssertionDetail, el: IRElement | undefined, indent: string): string {
  // A screenshot assertion is page-level and legitimately has no element.
  if (d.type === 'screenshot') {
    const name = javaStr(screenshotName(d.name))
    return `${indent}assertScreenshot(driver, ${name}, ${d.threshold ?? DEFAULT_SCREENSHOT_THRESHOLD});`
  }
  if (!el) return `${indent}// assert ${d.type} (no element)`
  const byExpr = renderByExpression(el)
  switch (d.type) {
    case 'visible':
      return `${indent}wait.until(ExpectedConditions.visibilityOfElementLocated(${byExpr}));`
    case 'hidden':
      return `${indent}wait.until(ExpectedConditions.invisibilityOfElementLocated(${byExpr}));`
    case 'text': {
      const expected = javaStr(String(d.expected ?? ''))
      return `${indent}assert driver.findElement(${byExpr}).getText().equals(${expected}) : "Expected text " + ${expected};`
    }
    case 'text-contains': {
      const expected = javaStr(String(d.expected ?? ''))
      return `${indent}assert driver.findElement(${byExpr}).getText().contains(${expected}) : "Expected text to contain " + ${expected};`
    }
    case 'not-empty':
      return `${indent}assert !driver.findElement(${byExpr}).getText().trim().isEmpty() : "Expected non-empty text";`
    case 'matches': {
      const pattern = javaStr(String(d.expected ?? ''))
      return `${indent}assert java.util.regex.Pattern.compile(${pattern}).matcher(driver.findElement(${byExpr}).getText()).find() : "Expected text to match " + ${pattern};`
    }
    case 'value': {
      const expected = javaStr(String(d.expected ?? ''))
      return `${indent}assert driver.findElement(${byExpr}).getAttribute("value").equals(${expected}) : "Expected value " + ${expected};`
    }
    case 'attribute': {
      const attr = javaStr(d.attribute ?? '')
      const expected = javaStr(String(d.expected ?? ''))
      return `${indent}assert driver.findElement(${byExpr}).getAttribute(${attr}).equals(${expected}) : "Expected attribute " + ${attr} + " = " + ${expected};`
    }
    case 'count': {
      const expected = Number(d.expected ?? 0)
      return `${indent}assert driver.findElements(${byExpr}).size() == ${expected};`
    }
  }
}

function renderWait(step: IRStep, indent: string): string {
  if (!step.wait) return ''
  if (step.wait.reason === 'networkidle') {
    return [
      `${indent}// networkidle has no direct Selenium equivalent — wait until DOM body is present.`,
      `${indent}wait.until(ExpectedConditions.presenceOfElementLocated(By.tagName("body")));`,
    ].join('\n')
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return ''
    const byExpr = renderByExpression(step.element)
    return `${indent}wait.until(ExpectedConditions.invisibilityOfElementLocated(${byExpr}));`
  }
  if (step.wait.reason === 'element-visible' && step.element) {
    const byExpr = renderByExpression(step.element)
    return `${indent}wait.until(ExpectedConditions.visibilityOfElementLocated(${byExpr}));`
  }
  return ''
}

function renderStepInTest(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}driver.get(${javaStr(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    const byExpr = renderByExpression(step.element)
    return `${indent}wait.until(ExpectedConditions.elementToBeClickable(${byExpr})).click();`
  }
  if (step.action === 'fill' && step.element) {
    const byExpr = renderByExpression(step.element)
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return [
      `${indent}WebElement _el = wait.until(ExpectedConditions.visibilityOfElementLocated(${byExpr}));`,
      `${indent}_el.clear();`,
      `${indent}_el.sendKeys(${expr});`,
    ].join('\n')
  }
  if (step.element) {
    const byExpr = renderByExpression(step.element)
    const interaction = renderJavaInteraction(
      step,
      {
        prelude: [
          `WebElement _el = wait.until(ExpectedConditions.visibilityOfElementLocated(${byExpr}));`,
        ],
        ref: '_el',
        scoped: true,
      },
      indent,
    )
    if (interaction) return interaction
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}driver.switchTo().activeElement().sendKeys(Keys.${step.key.toUpperCase()});`
  }
  if (step.action === 'wait') {
    return renderWait(step, indent)
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      return renderAssertion(step.assertionDetail, step.element, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  return ''
}

export function renderScenario(scenario: IRScenario): string {
  const pageImports = scenario.pages.map((p) => `import pages.${p.className};`).join('\n')

  const pageVars = scenario.pages
    .map((p) => `        ${p.className} ${toVarName(p.className)} = new ${p.className}(driver);`)
    .join('\n')

  const contextState = newContextState()
  const stepLines = scenario.pages
    .flatMap((page) =>
      page.steps
        .map((step) => {
          const rendered = renderStepInTest(step, '        ')
          if (!rendered) return ''
          return [...frameStatements(step, '        ', contextState), rendered].join('\n')
        })
        .filter(Boolean),
    )
    .join('\n')
  const allSteps = scenario.pages.flatMap((p) => p.steps)
  const contextHelpers = renderContextHelpers(allSteps)
  const contextImports = javaContextImports(allSteps)

  const networkNote = renderNetworkNote(
    scenario.pages.flatMap((p) => p.steps),
    '        ',
  )
  const safeBody = (networkNote + stepLines).trimEnd() || '        // no steps recorded'
  const methodSuffix = toJavaMethodName(scenario.name)
  const className = `Test${methodSuffix.charAt(0).toUpperCase() + methodSuffix.slice(1)}`

  const pageVarsBlock = pageVars ? `${pageVars}\n` : ''
  const interactionImports = javaInteractionImports(scenario.pages.flatMap((p) => p.steps))

  return `package tests;

import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;
${interactionImports}${contextImports}${pageImports}

public class ${className} {
    private WebDriver driver;
    private WebDriverWait wait;

    @BeforeMethod
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

    @Test
    public void ${methodSuffix}() {
${pageVarsBlock}${safeBody}
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }${contextHelpers}
}
`
}
