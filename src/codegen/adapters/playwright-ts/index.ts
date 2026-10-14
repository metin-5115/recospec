import type {
  IRPage,
  IRElement,
  IRStep,
  IRScenario,
  IRFallback,
  IRNetworkInfo,
  InferredMethod,
  GeneratedFile,
  AssertionDetail,
  TestDataConfig,
} from '../../ir/types'
import { registerAdapter, type FrameworkAdapter } from '../registry'
import { PLAYWRIGHT_SELF_HEALING_TS } from '../../scaffold/self-healing'
import { resolveTestData } from '../../planner/test-data-resolver'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'
import { dateFnsLocaleImportName } from '@shared/date-template'

// Module-scoped mock toggle. The orchestrator flips it before each render via
// the FrameworkAdapter.options field; defaulting to false keeps existing
// snapshot tests stable.
let RENDER_MOCKS = false
function setRenderMocks(value: boolean): void {
  RENDER_MOCKS = value
}

let TEST_DATA: TestDataConfig | undefined
function setTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

/** Render the value-substitution expression for a Playwright fill. */
function renderFillValueExpr(el: IRElement | undefined, recordedValue: string): string {
  const r = resolveTestData(el, recordedValue, TEST_DATA)
  if (!r.useEnvVar) return JSON.stringify(r.literal)
  return `process.env.${r.envVarName} ?? ${JSON.stringify(r.defaultValue)}`
}

function urlPattern(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    return `**${u.pathname}${u.search}`
  } catch {
    return rawUrl
  }
}

function safeJsonExpression(body: string | undefined): string {
  if (!body) return `''`
  const trimmed = body.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return trimmed
    } catch {
      // fall through to string fallback
    }
  }
  return JSON.stringify(body)
}

function renderMockBlock(net: IRNetworkInfo, indent: string): string {
  const pattern = urlPattern(net.url)
  const status = net.status ?? 200
  const contentType = net.contentType ?? 'application/json'
  const isJson = contentType.includes('json')
  const bodyExpr = isJson
    ? `JSON.stringify(${safeJsonExpression(net.responseBody)})`
    : JSON.stringify(net.responseBody ?? '')
  return `${indent}await page.route(${JSON.stringify(pattern)}, (route) => route.fulfill({
${indent}  status: ${status},
${indent}  contentType: ${JSON.stringify(contentType)},
${indent}  body: ${bodyExpr},
${indent}}));`
}

// ---------------------------------------------------------------------------
// Locator rendering
// ---------------------------------------------------------------------------

/**
 * Render a composed (anchor + target) chain relative to its root.
 * `filterExpr` overrides the container anchor's hasText value — passed as a
 * method parameter name in `param` mode, else the JSON-quoted recorded label.
 */
function renderComposed(el: IRElement, root: string, filterExpr?: string): string {
  const spec = el.composed
  if (!spec) return `${root}.locator(${JSON.stringify(el.locatorValue)})`
  let scope =
    spec.anchor.kind === 'testid'
      ? `${root}.getByTestId(${JSON.stringify(spec.anchor.value)})`
      : spec.anchor.kind === 'role'
        ? `${root}.getByRole(${JSON.stringify(spec.anchor.value)})`
        : `${root}.locator(${JSON.stringify(spec.anchor.css)})`
  // Container anchors narrow a repeated row by its stable label / position.
  if (spec.anchor.kind === 'container') {
    if (spec.anchor.filterText)
      scope += `.filter({ hasText: ${filterExpr ?? JSON.stringify(spec.anchor.filterText)} })`
    if (typeof spec.anchor.nthIndex === 'number') scope += `.nth(${spec.anchor.nthIndex})`
  }
  let expr: string
  if (spec.target.role && spec.target.name) {
    expr = `${scope}.getByRole(${JSON.stringify(spec.target.role)}, { name: ${JSON.stringify(spec.target.name)} })`
  } else if (spec.target.css) {
    expr = `${scope}.locator(${JSON.stringify(spec.target.css)})`
  } else if (spec.target.role) {
    expr = `${scope}.getByRole(${JSON.stringify(spec.target.role)})`
  } else {
    expr = `${scope}.locator(${JSON.stringify(spec.target.tag)})`
  }
  if (spec.filterText) expr += `.filter({ hasText: ${JSON.stringify(spec.filterText)} })`
  if (typeof spec.nthIndex === 'number') expr += `.nth(${spec.nthIndex})`
  return expr
}

// ---------------------------------------------------------------------------
// Template (parameterized data-value) rendering
// ---------------------------------------------------------------------------

/** The template's locator query with `nameExpr` injected as the accessible name. */
function templateQueryExpr(el: IRElement, root: string, nameExpr: string): string {
  const t = el.template
  if (!t) return `${root}.locator(${JSON.stringify(el.locatorValue)})`
  const scope = t.scope
    ? t.scope.kind === 'testid'
      ? `${root}.getByTestId(${JSON.stringify(t.scope.value)})`
      : t.scope.kind === 'role'
        ? `${root}.getByRole(${JSON.stringify(t.scope.value)})`
        : `${root}.locator(${JSON.stringify(t.scope.css)})`
    : root
  if (t.strategy === 'role-name' && t.role) {
    return `${scope}.getByRole(${JSON.stringify(t.role)}, { name: ${nameExpr} })`
  }
  if (t.strategy === 'aria-label') {
    return `${scope}.getByLabel(${nameExpr})`
  }
  return `${scope}.getByText(${nameExpr}, { exact: true })`
}

/** Timezone-safe `new Date(y, m, d)` constructor source for an ISO calendar date. */
function dateCtorFromIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `new Date(${y}, ${(m ?? 1) - 1}, ${d ?? 1})`
}

/**
 * Member expression for a template element inside the page-object class —
 * `this.dateCell(new Date(2026, 7, 12))` (param mode, concrete call site) or
 * `this.dateCell` (fixed / relative modes render property getters).
 */
function templateMemberExpr(el: IRElement): string {
  const t = el.template
  const mode = el.templateParamMode ?? 'param'
  if (!t || mode !== 'param') return `this.${el.name}`
  if (t.kind === 'date' && t.capturedNormalized) {
    return `this.${el.name}(${dateCtorFromIso(t.capturedNormalized)})`
  }
  return `this.${el.name}(${JSON.stringify(t.capturedValue)})`
}

/** Pull the value out of a `[attr="value"]` CSS selector (falls back to the raw selector). */
function attrValueOf(selector: string, attr: string): string {
  const m = selector.match(new RegExp(`\\[${attr}="(.*)"\\]$`))
  return m ? m[1].replace(/\\"/g, '"') : selector
}

/** Render a Playwright layout (spatial) locator via `:near()` / `:right-of()` etc. */
function renderLayout(el: IRElement, root: string): string {
  const spec = el.layout!
  const anchor = spec.anchor.name ? `:text(${JSON.stringify(spec.anchor.name)})` : spec.anchor.css
  const pseudo = spec.relation === 'near' ? 'near' : spec.relation
  return `${root}.locator(${JSON.stringify(`${spec.target.tag}:${pseudo}(${anchor})`)})`
}

/** Render the inner locator expression relative to its root (page or frame). */
function renderInnerLocator(el: IRElement, root: string): string {
  const val = el.locatorValue
  const strategy = el.locatorStrategy

  if (strategy === 'testid')
    return `${root}.getByTestId(${JSON.stringify(val.replace(/^\[data-testid="(.+)"\]$/, '$1'))})`
  if (strategy === 'aria-label')
    return `${root}.getByLabel(${JSON.stringify(val.replace(/^\[aria-label="(.+)"\]$/, '$1'))})`
  if (strategy === 'role-name') return `${root}.getByRole(${val})`
  if (strategy === 'text') return `${root}.getByText(${JSON.stringify(val)})`
  if (strategy === 'placeholder')
    return `${root}.getByPlaceholder(${JSON.stringify(attrValueOf(val, 'placeholder'))})`
  if (strategy === 'alt') return `${root}.getByAltText(${JSON.stringify(attrValueOf(val, 'alt'))})`
  if (strategy === 'title')
    return `${root}.getByTitle(${JSON.stringify(attrValueOf(val, 'title'))})`
  if (strategy === 'layout' && el.layout) return renderLayout(el, root)
  if (strategy === 'composed') return renderComposed(el, root)
  // Spec files have no method parameters — instantiate with the recorded value.
  if (strategy === 'template' && el.template)
    return templateQueryExpr(el, root, JSON.stringify(el.template.capturedValue))
  return `${root}.locator(${JSON.stringify(val)})`
}

export function renderLocator(el: IRElement): string {
  // Iframe chain: wrap with frameLocator() calls, outermost first
  let root = 'page'
  if (el.frameContext?.frameChain.length) {
    root = el.frameContext.frameChain.reduce(
      (acc, frame) => `${acc}.frameLocator(${JSON.stringify(frame)})`,
      'page',
    )
  }

  // Shadow DOM: chain .locator() calls through each host, then the inner selector
  if (el.shadowContext?.hostChain.length) {
    const hostChain = el.shadowContext.hostChain
      .map((h) => `locator(${JSON.stringify(h)})`)
      .join('.')
    return `${root}.${hostChain}.locator(${JSON.stringify(el.locatorValue)})`
  }

  return renderInnerLocator(el, root)
}

function renderFallbackExpr(f: IRFallback): string {
  const val = f.locatorValue
  switch (f.strategy) {
    case 'testid':
      return `getByTestId(${JSON.stringify(val.replace(/^\[data-testid="(.+)"\]$/, '$1'))})`
    case 'aria-label':
      return `getByLabel(${JSON.stringify(val.replace(/^\[aria-label="(.+)"\]$/, '$1'))})`
    case 'role-name':
      return `getByRole(${val})`
    case 'text':
      return `getByText(${JSON.stringify(val)})`
    default:
      return `locator(${JSON.stringify(val)})`
  }
}

/**
 * Page-object accessor for a template element. In `param` mode the POM never
 * contains the recorded data value — callers pass it in:
 *
 *   dateCell(date: Date) {
 *     const name = format(date, "d MMMM yyyy EEEE", { locale: tr });
 *     return this.page.getByRole("gridcell", { name });
 *   }
 */
function renderTemplateAccessor(el: IRElement): string {
  const t = el.template!
  const mode = el.templateParamMode ?? 'param'
  const meta =
    t.kind === 'date'
      ? `  // Template: ${t.nameTemplate} (date-fns pattern ${JSON.stringify(t.pattern ?? '')}, locale ${t.localeId ?? 'en-US'})`
      : `  // Template: ${t.nameTemplate}`

  if (mode === 'fixed' || (mode === 'relative' && t.kind !== 'date')) {
    const expr = templateQueryExpr(el, 'this.page', JSON.stringify(t.capturedValue))
    return `${meta} — frozen at the recorded value\n  get ${el.name}() { return ${expr}; }`
  }

  if (t.kind === 'date') {
    const loc = dateFnsLocaleImportName(t.localeId ?? 'en-US')
    const pattern = JSON.stringify(t.pattern ?? 'yyyy-MM-dd')
    const expr = templateQueryExpr(el, 'this.page', 'name')
    if (mode === 'relative') {
      const days = el.templateRelativeDays ?? 0
      return `${meta} — recomputed relative to the run day\n  get ${el.name}() {\n    const name = format(addDays(startOfToday(), ${days}), ${pattern}, { locale: ${loc} });\n    return ${expr};\n  }`
    }
    return `${meta}\n  ${el.name}(date: Date) {\n    const name = format(date, ${pattern}, { locale: ${loc} });\n    return ${expr};\n  }`
  }

  const expr = templateQueryExpr(el, 'this.page', 'value')
  return `${meta}\n  ${el.name}(value: string) {\n    return ${expr};\n  }`
}

/** True when a container-composed element should render as a parameterized accessor. */
function isContainerParam(el: IRElement): boolean {
  return (
    el.locatorStrategy === 'composed' &&
    el.composed?.anchor.kind === 'container' &&
    el.composedParamMode === 'param' &&
    Boolean(el.composed.anchor.filterText)
  )
}

/**
 * Parameterized accessor for a container-anchored element — the row's stable
 * label becomes a method parameter so the POM holds no hardcoded value:
 *
 *   priceCell(name: string) {
 *     return this.page.locator("div.card").filter({ hasText: name }).locator("p.price");
 *   }
 */
function renderContainerAccessor(el: IRElement): string {
  const expr = renderComposed(el, 'this.page', 'name')
  const meta = `  // Container row scoped by a parameter (was: ${JSON.stringify(el.composed!.anchor.filterText)})`
  return `${meta}\n  ${el.name}(name: string) {\n    return ${expr};\n  }`
}

/** Member expression for a click/assert target — instantiates param accessors. */
function memberExpr(el: IRElement): string {
  if (isContainerParam(el))
    return `this.${el.name}(${JSON.stringify(el.composed!.anchor.filterText)})`
  return templateMemberExpr(el)
}

function renderElementGetter(el: IRElement): string {
  if (el.locatorStrategy === 'template' && el.template) {
    const accessor = renderTemplateAccessor(el)
    if (!el.fallbackLocators?.length) return accessor
    const exprs = el.fallbackLocators.map(renderFallbackExpr).join(', ')
    return `${accessor}\n  // Fallbacks: ${exprs}`
  }
  if (isContainerParam(el)) {
    const accessor = renderContainerAccessor(el)
    if (!el.fallbackLocators?.length) return accessor
    const exprs = el.fallbackLocators.map(renderFallbackExpr).join(', ')
    return `${accessor}\n  // Fallbacks: ${exprs}`
  }
  const fragileWarning = el.fragile
    ? `  // FRAGILE: positional index — breaks when siblings are added/removed. No stable attribute was available; consider adding a data-testid.\n`
    : ''
  const shadowWarning = el.shadowClosed
    ? `${fragileWarning}  // WARNING: element is inside a closed shadow root — locator may be unreliable\n`
    : fragileWarning
  // Inside the page-object class the Page lives on `this.page`, not a bare
  // `page` binding (that only exists in spec scope). Re-root the locator.
  const locator = renderLocator(el).replace(/^page\b/, 'this.page')
  const primary = `${shadowWarning}  get ${el.name}() { return ${locator}; }`
  if (!el.fallbackLocators?.length) return primary
  const exprs = el.fallbackLocators.map(renderFallbackExpr).join(', ')
  const fallbackComment = `  // Fallbacks: ${exprs}`
  return `${primary}\n${fallbackComment}`
}

// ---------------------------------------------------------------------------
// Assertion rendering
// ---------------------------------------------------------------------------

function renderAssertionMatcher(d: AssertionDetail, locator: string, indent: string): string {
  switch (d.type) {
    case 'visible':
      return `${indent}await expect(${locator}).toBeVisible();`
    case 'hidden':
      return `${indent}await expect(${locator}).toBeHidden();`
    case 'text':
      return `${indent}await expect(${locator}).toHaveText(${JSON.stringify(d.expected ?? '')});`
    case 'text-contains':
      return `${indent}await expect(${locator}).toContainText(${JSON.stringify(d.expected ?? '')});`
    case 'not-empty':
      return `${indent}await expect(${locator}).not.toBeEmpty();`
    case 'matches':
      return `${indent}await expect(${locator}).toHaveText(new RegExp(${JSON.stringify(String(d.expected ?? ''))}));`
    case 'value':
      return `${indent}await expect(${locator}).toHaveValue(${JSON.stringify(d.expected ?? '')});`
    case 'attribute':
      return `${indent}await expect(${locator}).toHaveAttribute(${JSON.stringify(d.attribute ?? '')}, ${JSON.stringify(d.expected ?? '')});`
    case 'count':
      return `${indent}await expect(${locator}).toHaveCount(${Number(d.expected ?? 0)});`
    case 'screenshot': {
      const file = `${d.name ?? 'snapshot'}.png`
      const threshold = d.threshold ?? 0.2
      return `${indent}await expect(${locator}).toHaveScreenshot(${JSON.stringify(file)}, { threshold: ${threshold} });`
    }
  }
}

// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------

/** IR action → Playwright locator method for the element-targeted interactions. */
const INTERACTION_CALLS: Partial<Record<IRStep['action'], string>> = {
  select: 'selectOption',
  check: 'check',
  uncheck: 'uncheck',
  hover: 'hover',
  dblclick: 'dblclick',
}

function renderStepInMethod(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}await this.page.goto(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}await ${memberExpr(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return `${indent}await this.${step.element.name}.fill(${expr});`
  }
  if (step.element && INTERACTION_CALLS[step.action]) {
    const args = step.action === 'select' ? JSON.stringify(step.value ?? '') : ''
    return `${indent}await ${memberExpr(step.element)}.${INTERACTION_CALLS[step.action]}(${args});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}await this.page.keyboard.press(${JSON.stringify(step.key)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      const target =
        step.assertionDetail.type === 'screenshot' || !step.element
          ? 'this.page'
          : memberExpr(step.element)
      return renderAssertionMatcher(step.assertionDetail, target, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  if (step.action === 'network' && step.network) {
    if (!RENDER_MOCKS) return ''
    // Page-object methods receive `this.page`; rewrite the helper accordingly.
    return renderMockBlock(step.network, indent).replace(/\bpage\.route\(/g, 'this.page.route(')
  }
  if (step.action === 'wait' && step.wait) {
    return renderWaitInMethod(step, indent)
  }
  return ''
}

function renderWaitInSpec(step: IRStep, indent: string): string {
  if (!step.wait) return ''
  const timeout = step.wait.timeoutMs
  if (step.wait.reason === 'networkidle') {
    return `${indent}await page.waitForLoadState('networkidle');`
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return `${indent}await page.waitForLoadState('networkidle');`
    return `${indent}await ${renderLocator(step.element)}.waitFor({ state: 'hidden', timeout: ${timeout} });`
  }
  if (step.wait.reason === 'element-visible' && step.element) {
    return `${indent}await ${renderLocator(step.element)}.waitFor({ state: 'visible', timeout: ${timeout} });`
  }
  return ''
}

function renderWaitInMethod(step: IRStep, indent: string): string {
  if (!step.wait) return ''
  const timeout = step.wait.timeoutMs
  if (step.wait.reason === 'networkidle') {
    return `${indent}await this.page.waitForLoadState('networkidle');`
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return `${indent}await this.page.waitForLoadState('networkidle');`
    // Page-object getters expose locators via `this.<name>`, so we don't need
    // to re-render the full chain — the named getter is canonical.
    return `${indent}await this.${step.element.name}.waitFor({ state: 'hidden', timeout: ${timeout} });`
  }
  if (step.wait.reason === 'element-visible' && step.element) {
    return `${indent}await this.${step.element.name}.waitFor({ state: 'visible', timeout: ${timeout} });`
  }
  return ''
}

function renderStepInSpec(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}await page.goto(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}await ${renderLocator(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return `${indent}await ${renderLocator(step.element)}.fill(${expr});`
  }
  if (step.element && INTERACTION_CALLS[step.action]) {
    const args = step.action === 'select' ? JSON.stringify(step.value ?? '') : ''
    return `${indent}await ${renderLocator(step.element)}.${INTERACTION_CALLS[step.action]}(${args});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}await page.keyboard.press(${JSON.stringify(step.key)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      const target =
        step.assertionDetail.type === 'screenshot' || !step.element
          ? 'page'
          : renderLocator(step.element)
      return renderAssertionMatcher(step.assertionDetail, target, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  if (step.action === 'network' && step.network) {
    if (!RENDER_MOCKS) return ''
    return renderMockBlock(step.network, indent)
  }
  if (step.action === 'wait' && step.wait) {
    return renderWaitInSpec(step, indent)
  }
  return ''
}

// ---------------------------------------------------------------------------
// Method rendering (inferred)
// ---------------------------------------------------------------------------

const PARAM_SUFFIX_REGEX = /Input$|Button$|Btn$|Link$|Select$|Field$|Box$|Toggle$|Checkbox$|Radio$/

function paramSlugFromElement(name: string): string {
  const stripped = name.replace(PARAM_SUFFIX_REGEX, '')
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}

function tsType(t: string | undefined): string {
  return t === 'date' ? 'Date' : (t ?? 'string')
}

function renderInferredMethod(method: InferredMethod): string {
  const types = method.paramTypes ?? method.params.map(() => 'string')
  const paramList = method.params.map((p, i) => `${p}: ${tsType(types[i])}`).join(', ')
  const bodyLines = method.steps
    .map((s) => {
      // A click on a template element receives the data value as a parameter.
      if (s.action === 'click' && s.element?.template) {
        const param = s.element.template.kind === 'date' ? 'date' : 'value'
        const idx = method.params.indexOf(param)
        if (idx !== -1) {
          return `    await this.${s.element.name}(${method.params[idx]}).click();`
        }
      }
      // A click on a container-param element receives the row label as a parameter.
      if (s.action === 'click' && s.element && isContainerParam(s.element)) {
        const idx = method.params.indexOf('name')
        if (idx !== -1) return `    await this.${s.element.name}(${method.params[idx]}).click();`
      }
      // Substitute the param name into fill calls when the slug matches.
      if (s.action === 'fill' && s.element) {
        const slug = paramSlugFromElement(s.element.name)
        const paramIdx = method.params.findIndex((p) => p === slug)
        if (paramIdx !== -1) {
          const ref =
            types[paramIdx] === 'string'
              ? method.params[paramIdx]
              : `String(${method.params[paramIdx]})`
          return `    await this.${s.element.name}.fill(${ref});`
        }
      }
      // A select receives its option value as a parameter when the slug matches.
      if (s.action === 'select' && s.element) {
        const paramIdx = method.params.findIndex((p) => p === paramSlugFromElement(s.element!.name))
        if (paramIdx !== -1) {
          return `    await this.${s.element.name}.selectOption(${method.params[paramIdx]});`
        }
      }
      // check/uncheck driven by a boolean parameter collapses to setChecked(param).
      if ((s.action === 'check' || s.action === 'uncheck') && s.element) {
        const paramIdx = method.params.findIndex(
          (p, i) => types[i] === 'boolean' && p === paramSlugFromElement(s.element!.name),
        )
        if (paramIdx !== -1) {
          return `    await this.${s.element.name}.setChecked(${method.params[paramIdx]});`
        }
      }
      return renderStepInMethod(s, '    ')
    })
    .filter(Boolean)
    .join('\n')

  return `  async ${method.name}(${paramList}) {\n${bodyLines}\n  }`
}

// ---------------------------------------------------------------------------
// Page Object
// ---------------------------------------------------------------------------

/** date-fns import lines for a page whose template elements format dates. */
function renderDateFnsImports(page: IRPage): string {
  const fns = new Set<string>()
  const locales = new Set<string>()
  for (const el of page.elements) {
    const t = el.template
    if (!t || t.kind !== 'date' || el.locatorStrategy !== 'template') continue
    const mode = el.templateParamMode ?? 'param'
    if (mode === 'fixed') continue
    fns.add('format')
    if (mode === 'relative') {
      fns.add('addDays')
      fns.add('startOfToday')
    }
    locales.add(dateFnsLocaleImportName(t.localeId ?? 'en-US'))
  }
  if (fns.size === 0) return ''
  const fnList = [...fns].sort().join(', ')
  const localeList = [...locales].sort().join(', ')
  return `import { ${fnList} } from 'date-fns';\nimport { ${localeList} } from 'date-fns/locale';\n`
}

export function renderPageObject(page: IRPage): string {
  const elementGetters = page.elements.map(renderElementGetter).join('\n\n')

  const gotoStep = page.steps.find((s) => s.action === 'navigate')
  const gotoUrl = gotoStep?.url ?? '/'

  let methodsBlock = ''
  if (page.inferredMethods?.length) {
    methodsBlock = '\n' + page.inferredMethods.map(renderInferredMethod).join('\n\n')
  } else {
    const stepLines = page.steps
      .filter((s) => s.action !== 'navigate')
      .map((s) => renderStepInMethod(s, '    '))
      .filter(Boolean)
      .join('\n')
    if (stepLines) {
      methodsBlock = `\n  async performSteps() {\n${stepLines}\n  }`
    }
  }

  const collisionComment = page.collisionWarning
    ? `  // WARNING: Multiple pages share this URL pattern (${page.normalizedUrl}) with different titles.\n`
    : ''

  return `import { type Page } from '@playwright/test';
${renderDateFnsImports(page)}
export class ${page.className} {
  constructor(private readonly page: Page) {}

${elementGetters}

${collisionComment}  async goto() {
    await this.page.goto(${JSON.stringify(gotoUrl)});
  }
${methodsBlock}
}
`
}

// ---------------------------------------------------------------------------
// Scenario (spec file)
// ---------------------------------------------------------------------------

export function renderScenario(scenario: IRScenario): string {
  const imports = scenario.pages
    .map((p) => `import { ${p.className} } from './${p.className}';`)
    .join('\n')

  const testBody = scenario.pages
    .flatMap((page) => page.steps.map((step) => renderStepInSpec(step, '    ')).filter(Boolean))
    .join('\n')

  return `import { test, expect } from '@playwright/test';
${imports}

test.describe('${scenario.name}', () => {
  test('full flow', async ({ page }) => {
${testBody}
  });
});
`
}

// ---------------------------------------------------------------------------
// Scaffold (package.json, playwright.config.ts, tsconfig.json)
// ---------------------------------------------------------------------------

function renderEnvExample(): GeneratedFile | null {
  const params = TEST_DATA?.params.filter((p) => p.useEnvVar) ?? []
  if (!params.length) return null
  const header = '# Recospec — copy to .env and fill in your test data values.\n'
  const body = params.map((p) => `${p.envVarName}=${p.isSecret ? '' : p.defaultValue}`).join('\n')
  return { filename: '.env.example', content: `${header}${body}\n` }
}

export function renderScaffold(): GeneratedFile[] {
  const packageJson = JSON.stringify(
    {
      name: 'recospec-generated-tests',
      version: '1.0.0',
      private: true,
      scripts: {
        test: 'playwright test',
        'test:headed': 'playwright test --headed',
      },
      devDependencies: {
        '@playwright/test': '^1.40.0',
        // date-fns powers parameterized date-template page-object accessors.
        'date-fns': '^3.6.0',
        typescript: '^5.3.0',
      },
    },
    null,
    2,
  )

  const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`

  const tsConfig = JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        lib: ['ES2022'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: 'dist',
      },
      include: ['**/*.ts'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2,
  )

  const files: GeneratedFile[] = [
    { filename: 'package.json', content: packageJson },
    { filename: 'playwright.config.ts', content: playwrightConfig },
    { filename: 'tsconfig.json', content: tsConfig },
    { filename: 'utils/locator.ts', content: PLAYWRIGHT_SELF_HEALING_TS },
    { filename: 'tests/scenario.spec.ts-snapshots/.gitkeep', content: '' },
  ]
  const envExample = renderEnvExample()
  if (envExample) files.push(envExample)
  return files
}

// ---------------------------------------------------------------------------
// Adapter SDK registration
// ---------------------------------------------------------------------------

export const playwrightTsAdapter: FrameworkAdapter = {
  id: 'playwright-ts',
  displayName: 'Playwright TS',
  fileExtension: 'ts',
  metadata: {
    language: 'TypeScript',
    testRunner: '@playwright/test',
    packageName: '@playwright/test',
  },
  applyOptions(options) {
    setRenderMocks(Boolean(options.includeMocks))
    setTestData(options.testData)
  },
  renderPageObject(page) {
    return { filename: `${page.className}.ts`, content: renderPageObject(page) }
  },
  renderScenario(scenario) {
    return { filename: 'scenario.spec.ts', content: renderScenario(scenario) }
  },
  renderScaffold() {
    return renderScaffold()
  },
  renderBddFeature(scenario) {
    return { filename: 'scenario.feature', content: renderFeatureFile(scenario) }
  },
  renderBddSteps(scenario) {
    return { filename: 'scenario.steps.ts', content: renderStepsFile(scenario) }
  },
  renderBddScaffold() {
    return renderBddScaffoldFiles()
  },
}

registerAdapter(playwrightTsAdapter)
