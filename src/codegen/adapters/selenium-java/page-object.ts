import type {
  IRPage,
  IRElement,
  IRStep,
  InferredMethod,
  AssertionDetail,
  IRParamType,
  TestDataConfig,
} from '../../ir/types'
import {
  renderFindByAnnotation,
  renderFallbackAnnotation,
  renderByExpression,
  javaStr,
} from './locator'
import {
  renderJavaInteraction,
  javaInteractionImports,
  type JavaInteractionTarget,
} from './interaction'
import { resolveTestData } from '../../planner/test-data-resolver'

let TEST_DATA: TestDataConfig | undefined
export function setSeleniumJavaPageObjectTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

function renderFillValueExpr(el: IRElement | undefined, recordedValue: string): string {
  const r = resolveTestData(el, recordedValue, TEST_DATA)
  if (!r.useEnvVar) return javaStr(r.literal)
  return `System.getenv().getOrDefault(${javaStr(r.envVarName)}, ${javaStr(r.defaultValue)})`
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

const RESERVED_JAVA_WORDS = new Set([
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'try',
  'void',
  'volatile',
  'while',
  'true',
  'false',
  'null',
])

/** Convert any IR identifier to a valid Java field name (camelCase). */
export function toJavaFieldName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, '_')
  const camel = cleaned
    .split('_')
    .filter(Boolean)
    .map((part, i) =>
      i === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('')
  const safe = camel || 'el'
  if (RESERVED_JAVA_WORDS.has(safe) || /^\d/.test(safe)) return `_${safe}`
  return safe
}

const PARAM_SUFFIX_REGEX = /Input$|Button$|Btn$|Link$|Select$|Field$|Box$|Toggle$|Checkbox$|Radio$/

function paramSlugFromElement(name: string): string {
  const stripped = name.replace(PARAM_SUFFIX_REGEX, '')
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}

function javaType(t: IRParamType | undefined): string {
  if (t === 'number') return 'double'
  if (t === 'boolean') return 'boolean'
  return 'String'
}

// ---------------------------------------------------------------------------
// Field declaration (annotation + WebElement field)
// ---------------------------------------------------------------------------

/**
 * Parameterized accessor for a template element (param mode).
 *
 * ASSUMPTION: like the Python adapter, the formatted accessible label is
 * passed as a String — keeps the generated code dependency-free and avoids
 * date-fns ↔ DateTimeFormatter pattern-translation risk. Pattern + locale are
 * documented inline.
 */
function renderTemplateAccessor(el: IRElement): string {
  const t = el.template!
  const scopePrefix = t.scope?.xpath ?? ''
  const tag = el.tagName?.toLowerCase() || '*'
  const meta =
    t.kind === 'date'
      ? `        // Template: ${t.nameTemplate} — pass the label formatted as "${t.pattern ?? ''}" (locale ${t.localeId ?? 'en-US'}).`
      : `        // Template: ${t.nameTemplate} — pass the visible value as rendered by the UI.`
  const param = t.kind === 'date' ? 'date' : 'value'
  const xpathExpr = `"${scopePrefix}//${tag}[normalize-space()=\\"" + ${param} + "\\"]"`
  return [
    `    public WebElement ${toJavaFieldName(el.name)}(String ${param}) {`,
    meta,
    `        return wait.until(ExpectedConditions.presenceOfElementLocated(By.xpath(${xpathExpr})));`,
    `    }`,
  ].join('\n')
}

function renderElementField(el: IRElement): string {
  const fieldName = toJavaFieldName(el.name)
  const lines: string[] = []
  if (el.locatorStrategy === 'template' && el.template) {
    const mode = el.templateParamMode ?? 'param'
    if (mode === 'param') {
      lines.push(
        `    // Template: ${el.template.nameTemplate} — see ${toJavaFieldName(el.name)}(String) for the parameterized accessor`,
      )
    } else if (mode === 'relative') {
      lines.push(
        `    // TODO: relative date mode is not supported in the Selenium Java adapter — frozen at the recorded value`,
      )
    }
  }
  if (el.shadowClosed) {
    lines.push(`    // WARNING: element is inside a closed shadow root — locator may be unreliable`)
  }
  if (el.frameContext?.frameChain.length) {
    lines.push(
      `    // WARNING: element is inside an iframe (${el.frameContext.frameChain.join(' > ')}) — driver.switchTo().frame(...) before use`,
    )
  }
  lines.push(`    ${renderFindByAnnotation(el)}`)
  lines.push(`    private WebElement ${fieldName};`)
  if (el.fallbackLocators?.length) {
    const exprs = el.fallbackLocators.map(renderFallbackAnnotation).join(', ')
    lines.push(`    // Fallbacks: ${exprs}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------

function renderAssertion(d: AssertionDetail, el: IRElement | undefined, indent: string): string {
  const fieldRef = el ? toJavaFieldName(el.name) : null
  switch (d.type) {
    case 'visible':
      if (!fieldRef) return `${indent}// assert visible (no element)`
      return `${indent}wait.until(ExpectedConditions.visibilityOf(${fieldRef}));`
    case 'hidden':
      if (!fieldRef || !el) return `${indent}// assert hidden (no element)`
      return `${indent}wait.until(ExpectedConditions.invisibilityOfElementLocated(${renderByExpression(el)}));`
    case 'text': {
      if (!fieldRef) return `${indent}// assert text (no element)`
      const expected = javaStr(String(d.expected ?? ''))
      return `${indent}assert ${fieldRef}.getText().equals(${expected}) : "Expected text " + ${expected};`
    }
    case 'text-contains': {
      if (!fieldRef) return `${indent}// assert text contains (no element)`
      const expected = javaStr(String(d.expected ?? ''))
      return `${indent}assert ${fieldRef}.getText().contains(${expected}) : "Expected text to contain " + ${expected};`
    }
    case 'not-empty': {
      if (!fieldRef) return `${indent}// assert not empty (no element)`
      return `${indent}assert !${fieldRef}.getText().trim().isEmpty() : "Expected non-empty text";`
    }
    case 'matches': {
      if (!fieldRef) return `${indent}// assert matches (no element)`
      const pattern = javaStr(String(d.expected ?? ''))
      return `${indent}assert java.util.regex.Pattern.compile(${pattern}).matcher(${fieldRef}.getText()).find() : "Expected text to match " + ${pattern};`
    }
    case 'value': {
      if (!fieldRef) return `${indent}// assert value (no element)`
      const expected = javaStr(String(d.expected ?? ''))
      return `${indent}assert ${fieldRef}.getAttribute("value").equals(${expected}) : "Expected value " + ${expected};`
    }
    case 'attribute': {
      if (!fieldRef) return `${indent}// assert attribute (no element)`
      const attr = javaStr(d.attribute ?? '')
      const expected = javaStr(String(d.expected ?? ''))
      return `${indent}assert ${fieldRef}.getAttribute(${attr}).equals(${expected}) : "Expected attribute " + ${attr} + " = " + ${expected};`
    }
    case 'count': {
      if (!el) return `${indent}// assert count (no element)`
      const expected = Number(d.expected ?? 0)
      return `${indent}assert driver.findElements(${renderByExpression(el)}).size() == ${expected};`
    }
    case 'screenshot': {
      const name = (d.name ?? 'snapshot').replace(/[^A-Za-z0-9_-]/g, '_')
      return `${indent}// TODO: integrate pixel-diff (e.g. ashot) — stub saves a screenshot to screenshots/${name}.png`
    }
  }
}

/**
 * Page-object fields are already WebElements — wait for visibility, then use
 * them. Referenced via `this.` because a method parameter may share the field's
 * name (an element named `country` with a `country` parameter).
 */
function fieldTarget(el: IRElement): JavaInteractionTarget {
  const ref = `this.${toJavaFieldName(el.name)}`
  return {
    prelude: [`wait.until(ExpectedConditions.visibilityOf(${ref}));`],
    ref,
    scoped: false,
  }
}

function renderStepInMethod(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}driver.get(${javaStr(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    const fieldRef = toJavaFieldName(step.element.name)
    return `${indent}wait.until(ExpectedConditions.elementToBeClickable(${fieldRef})).click();`
  }
  if (step.action === 'fill' && step.element) {
    const fieldRef = toJavaFieldName(step.element.name)
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return [
      `${indent}wait.until(ExpectedConditions.visibilityOf(${fieldRef}));`,
      `${indent}${fieldRef}.clear();`,
      `${indent}${fieldRef}.sendKeys(${expr});`,
    ].join('\n')
  }
  if (step.element) {
    const interaction = renderJavaInteraction(step, fieldTarget(step.element), indent)
    if (interaction) return interaction
  }
  if (step.action === 'keypress' && step.key) {
    const keyConst = step.key.toUpperCase()
    return `${indent}driver.switchTo().activeElement().sendKeys(Keys.${keyConst});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      return renderAssertion(step.assertionDetail, step.element, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  // network mocking is not supported in core Selenium
  return ''
}

// ---------------------------------------------------------------------------
// Inferred methods
// ---------------------------------------------------------------------------

function renderInferredMethod(method: InferredMethod): string {
  const types = method.paramTypes ?? method.params.map(() => 'string' as IRParamType)
  const params = method.params.map((p, i) => `${javaType(types[i])} ${p}`).join(', ')

  const body = method.steps
    .map((s) => {
      // A click on a template element receives the formatted label as a parameter.
      if (s.action === 'click' && s.element?.template) {
        const param = s.element.template.kind === 'date' ? 'date' : 'value'
        const idx = method.params.indexOf(param)
        if (idx !== -1) {
          const accessor = toJavaFieldName(s.element.name)
          return `        wait.until(ExpectedConditions.elementToBeClickable(${accessor}(${method.params[idx]}))).click();`
        }
      }
      if (s.action === 'fill' && s.element) {
        const slug = paramSlugFromElement(s.element.name)
        const idx = method.params.findIndex((p) => p === slug)
        if (idx !== -1) {
          const fieldRef = toJavaFieldName(s.element.name)
          const paramName = method.params[idx]
          const valueExpr =
            types[idx] === 'string'
              ? paramName
              : types[idx] === 'boolean'
                ? `Boolean.toString(${paramName})`
                : `Double.toString(${paramName})`
          return [
            `        wait.until(ExpectedConditions.visibilityOf(${fieldRef}));`,
            `        ${fieldRef}.clear();`,
            `        ${fieldRef}.sendKeys(${valueExpr});`,
          ].join('\n')
        }
      }
      if (s.action === 'select' && s.element) {
        const idx = method.params.findIndex((p) => p === paramSlugFromElement(s.element!.name))
        if (idx !== -1) {
          return renderJavaInteraction(s, fieldTarget(s.element), '        ', {
            selectArg: method.params[idx],
          })
        }
      }
      if ((s.action === 'check' || s.action === 'uncheck') && s.element) {
        const idx = method.params.findIndex(
          (p, i) => types[i] === 'boolean' && p === paramSlugFromElement(s.element!.name),
        )
        if (idx !== -1) {
          return renderJavaInteraction(s, fieldTarget(s.element), '        ', {
            toggleParam: method.params[idx],
          })
        }
      }
      return renderStepInMethod(s, '        ')
    })
    .filter(Boolean)
    .join('\n')

  return `    public void ${method.name}(${params}) {\n${body || '        // no steps'}\n    }`
}

// ---------------------------------------------------------------------------
// Page Object class
// ---------------------------------------------------------------------------

export function renderPageObject(page: IRPage): string {
  const fieldDecls = page.elements.map(renderElementField).join('\n\n')

  const gotoStep = page.steps.find((s) => s.action === 'navigate')
  const gotoUrl = gotoStep?.url ?? '/'

  const templateAccessors = page.elements
    .filter(
      (el) =>
        el.locatorStrategy === 'template' &&
        el.template &&
        (el.templateParamMode ?? 'param') === 'param',
    )
    .map(renderTemplateAccessor)
  const accessorsBlock = templateAccessors.length ? '\n\n' + templateAccessors.join('\n\n') : ''

  let methodsBlock = ''
  if (page.inferredMethods?.length) {
    methodsBlock = '\n\n' + page.inferredMethods.map(renderInferredMethod).join('\n\n')
  } else {
    const stepLines = page.steps
      .filter((s) => s.action !== 'navigate')
      .map((s) => renderStepInMethod(s, '        '))
      .filter(Boolean)
      .join('\n')
    if (stepLines) {
      methodsBlock = `\n\n    public void performSteps() {\n${stepLines}\n    }`
    }
  }

  const collisionComment = page.collisionWarning
    ? `    // WARNING: Multiple pages share this URL pattern (${page.normalizedUrl}) with different titles.\n`
    : ''

  const fieldsBlock = fieldDecls ? `${fieldDecls}\n\n` : ''
  const allSteps = [...page.steps, ...(page.inferredMethods ?? []).flatMap((m) => m.steps)]

  return `package pages;

import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
${javaInteractionImports(allSteps)}
public class ${page.className} {
${collisionComment}    private final WebDriver driver;
    private final WebDriverWait wait;

${fieldsBlock}    public ${page.className}(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        PageFactory.initElements(driver, this);
    }

    public void goTo() {
        driver.get(${javaStr(gotoUrl)});
    }${accessorsBlock}${methodsBlock}
}
`
}
