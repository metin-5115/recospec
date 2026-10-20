import type { IRPage, IRScenario, IRStep, AssertionDetail, IRElement } from '../../ir/types'
import { urlAssertionPattern } from '../../shared/url-assertion'
import { renderByExpression, javaStr } from './locator'
import { renderJavaInteraction, javaInteractionImports } from './interaction'
import { renderNetworkNote } from '../../shared/network-note'
import {
  DEFAULT_SCREENSHOT_THRESHOLD,
  frameStatements,
  javaContextImports,
  newContextState,
  renderContextHelpers,
  screenshotName,
} from './context'
import { resolveTestData } from '../../planner/test-data-resolver'
import { renderFillValueExpr } from './fill-value'
import { javaUrlExpr } from './base-url'
import { javaPackages } from './packages'
import { javaTestDataImport } from './test-data'
import type { RenderOptions } from '../registry'
import {
  buildScenarioFlow,
  initialUrl,
  navigationTarget,
  pagesUsed,
  recordedOrigin,
  routeWithin,
  type FlowArg,
  type FlowItem,
} from '../../shared/scenario-flow'
import { FLOW_SLUG_FALLBACK, flowPascalName } from '../../shared/flow-slug'

/** Convert a recorded scenario name to a valid Java method name suffix. */
export function toJavaMethodName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, ' ').trim()
  if (!cleaned) return FLOW_SLUG_FALLBACK
  const parts = cleaned.split(/\s+/)
  const camel = parts
    .map((p, i) =>
      i === 0
        ? p.charAt(0).toLowerCase() + p.slice(1).toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
    )
    .join('')
  // A method name cannot start with a digit (`2FA login` → `flow2faLogin`).
  return /^\d/.test(camel)
    ? `${FLOW_SLUG_FALLBACK}${camel.charAt(0).toUpperCase()}${camel.slice(1)}`
    : camel
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
  if (d.type === 'url') {
    const pattern = urlAssertionPattern(String(d.expected ?? ''))
    return pattern.kind === 'contains'
      ? `${indent}wait.until(ExpectedConditions.urlContains(${javaStr(pattern.value)}));`
      : `${indent}wait.until(ExpectedConditions.urlMatches(${javaStr(pattern.source)}));`
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

function renderStepInTest(
  step: IRStep,
  page: IRPage,
  indent: string,
  options: RenderOptions,
): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}driver.get(${javaUrlExpr(options.baseUrl, navigationTarget(options.baseUrl, page, step.url))});`
  }
  if (step.action === 'click' && step.element) {
    const byExpr = renderByExpression(step.element)
    return `${indent}wait.until(ExpectedConditions.elementToBeClickable(${byExpr})).click();`
  }
  if (step.action === 'fill' && step.element) {
    const byExpr = renderByExpression(step.element)
    const expr = renderFillValueExpr(step.element, step.value ?? '', options.testData)
    // A block keeps each `_el` local out of its siblings' scope, so repeated fills compile.
    return [
      `${indent}{`,
      `${indent}    WebElement _el = wait.until(ExpectedConditions.visibilityOfElementLocated(${byExpr}));`,
      `${indent}    _el.clear();`,
      `${indent}    _el.sendKeys(${expr});`,
      `${indent}}`,
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

const INDENT = '        '

function renderArg(arg: FlowArg, options: RenderOptions): string {
  if (arg.fromFill && resolveTestData(arg.element, arg.value, options.testData).useEnvVar) {
    return renderFillValueExpr(arg.element, arg.value, options.testData)
  }
  switch (arg.type) {
    case 'boolean':
      return arg.value
    case 'number':
      return String(Number.isFinite(Number(arg.value)) ? Number(arg.value) : 0)
    default:
      // A date arrives as the label the page rendered (see the template accessor in the page object).
      return javaStr(arg.value)
  }
}

function renderItem(
  item: FlowItem,
  contextState: ReturnType<typeof newContextState>,
  options: RenderOptions,
): string[] {
  switch (item.kind) {
    case 'visit':
      return [
        `${INDENT}driver.get(${javaUrlExpr(options.baseUrl, routeWithin(options.baseUrl, item.url))});`,
      ]
    case 'call': {
      const args = item.args.map((a) => renderArg(a, options)).join(', ')
      return [`${INDENT}${toVarName(item.page.className)}.${item.method.name}(${args});`]
    }
    case 'inline':
      return item.page.steps
        .map((step) => {
          const rendered = renderStepInTest(step, item.page, INDENT, options)
          if (!rendered) return ''
          return [...frameStatements(step, INDENT, contextState), rendered].join('\n')
        })
        .filter(Boolean)
  }
}

export function renderScenario(scenario: IRScenario, given: RenderOptions = {}): string {
  // Routes are written relative to the origin the flow was recorded on, unless the caller pinned one.
  const options: RenderOptions = { ...given, baseUrl: given.baseUrl ?? recordedOrigin(scenario) }
  const flow = buildScenarioFlow(scenario)
  const used = pagesUsed(flow)
  const inlineSteps = flow.flatMap((item) => (item.kind === 'inline' ? item.page.steps : []))
  const hasInline = flow.some((item) => item.kind === 'inline')

  const packages = javaPackages(options.dirs)
  const pageImports = used.map((p) => `import ${packages.pages}.${p.className};`).join('\n')
  const pageVars = used.map(
    (p) => `${INDENT}${p.className} ${toVarName(p.className)} = new ${p.className}(driver);`,
  )
  const start = initialUrl(scenario, flow)
  const opening = start
    ? [`${INDENT}driver.get(${javaUrlExpr(options.baseUrl, routeWithin(options.baseUrl, start))});`]
    : []
  const contextState = newContextState()
  const stepLines = [
    ...opening,
    ...pageVars,
    ...flow.flatMap((item) => renderItem(item, contextState, options)),
  ].join('\n')

  const contextHelpers = renderContextHelpers(inlineSteps)
  const contextImports = javaContextImports(inlineSteps)
  const networkNote = renderNetworkNote(
    scenario.pages.flatMap((p) => p.steps),
    INDENT,
    '//',
    options,
  )
  const safeBody = (networkNote + stepLines).trimEnd() || `${INDENT}// no steps recorded`
  const methodSuffix = toJavaMethodName(scenario.name)
  const className = `${flowPascalName(scenario.name)}Test`
  const interactionImports = javaInteractionImports(inlineSteps)
  const testDataImport = javaTestDataImport(`${stepLines}${contextHelpers}`)
  const ownImports = [pageImports, testDataImport.trimEnd()].filter(Boolean).join('\n')
  const extraImports = `${interactionImports}${contextImports}${ownImports}`

  // Inline steps locate elements themselves; a test that only calls page objects needs neither
  // the locator types nor an explicit wait.
  const waitImports = hasInline
    ? `import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
`
    : 'import org.openqa.selenium.WebDriver;\n'
  const expectedConditionsImports = hasInline
    ? `import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
`
    : ''
  const waitField = hasInline ? '    private WebDriverWait wait;\n' : ''
  const waitInit = hasInline
    ? '        wait = new WebDriverWait(driver, Duration.ofSeconds(10));\n'
    : ''

  return `package ${packages.tests};

${waitImports}import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
${expectedConditionsImports}import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;
${extraImports ? `${extraImports}\n` : ''}
public class ${className} {
    private WebDriver driver;
${waitField}
    @BeforeMethod
    public void setUp() {
        ChromeOptions options = new ChromeOptions();
        if (!Boolean.parseBoolean(System.getProperty("headed", "false"))) {
            options.addArguments("--headless=new");
        }
        options.addArguments("--disable-gpu");
        options.addArguments("--window-size=1280,720");
        driver = new ChromeDriver(options);
${waitInit}    }

    @Test
    public void ${methodSuffix}() {
${safeBody}
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
