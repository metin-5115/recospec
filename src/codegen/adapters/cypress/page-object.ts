import type {
  IRPage,
  IRElement,
  IRStep,
  IRFallback,
  InferredMethod,
  AssertionDetail,
  TestDataConfig,
} from '../../ir/types'
import { renderLocator } from './locator'
import { renderInteraction, renderToggleByParam } from './interaction'
import { resolveTestData } from '../../planner/test-data-resolver'
import { dateFnsLocaleImportName } from '@shared/date-template'

let TEST_DATA: TestDataConfig | undefined
export function setCypressPageObjectTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

function renderFillValueExpr(el: IRElement | undefined, recordedValue: string): string {
  const r = resolveTestData(el, recordedValue, TEST_DATA)
  if (!r.useEnvVar) return JSON.stringify(r.literal)
  return `Cypress.env(${JSON.stringify(r.paramName)}) || ${JSON.stringify(r.defaultValue)}`
}

// ---------------------------------------------------------------------------
// Element getters
// ---------------------------------------------------------------------------

function renderFallbackExpr(f: IRFallback): string {
  const val = f.locatorValue
  switch (f.strategy) {
    case 'testid': {
      const name = val.replace(/^\[data-testid="(.+)"\]$/, '$1')
      return `cy.get('[data-testid="${name}"]')`
    }
    case 'aria-label': {
      const label = val.replace(/^\[aria-label="(.+)"\]$/, '$1')
      return `cy.findByLabelText(${JSON.stringify(label)})`
    }
    case 'role-name':
      return `cy.findByRole(${val})`
    case 'text':
      return `cy.contains(${JSON.stringify(val)})`
    default:
      return `cy.get(${JSON.stringify(val)})`
  }
}

// ---------------------------------------------------------------------------
// Template (parameterized data-value) accessors
// ---------------------------------------------------------------------------

/** Cypress chainable for a template element with `nameExpr` as the visible name. */
function cyTemplateExpr(el: IRElement, nameExpr: string): string {
  const t = el.template
  if (!t) return `cy.get(${JSON.stringify(el.locatorValue)})`
  const scope = t.scope ? `cy.get(${JSON.stringify(t.scope.css)})` : null
  const tag = el.tagName?.toLowerCase() || '*'
  if (t.strategy === 'aria-label') {
    const sel = `'[aria-label="' + ${nameExpr} + '"]'`
    return scope ? `${scope}.find(${sel})` : `cy.get(${sel})`
  }
  // role-name / text approximate via .contains(tag, name) — same trade-off as composed.
  return scope
    ? `${scope}.contains(${JSON.stringify(tag)}, ${nameExpr})`
    : `cy.contains(${JSON.stringify(tag)}, ${nameExpr})`
}

function renderTemplateAccessor(el: IRElement): string {
  const t = el.template!
  const mode = el.templateParamMode ?? 'param'
  const meta =
    t.kind === 'date'
      ? `  // Template: ${t.nameTemplate} (date-fns pattern ${JSON.stringify(t.pattern ?? '')}, locale ${t.localeId ?? 'en-US'})`
      : `  // Template: ${t.nameTemplate}`

  if (mode === 'fixed' || (mode === 'relative' && t.kind !== 'date')) {
    const expr = cyTemplateExpr(el, JSON.stringify(t.capturedValue))
    return `${meta} — frozen at the recorded value\n  ${el.name}() { return ${expr}; }`
  }

  if (t.kind === 'date') {
    const loc = dateFnsLocaleImportName(t.localeId ?? 'en-US')
    const pattern = JSON.stringify(t.pattern ?? 'yyyy-MM-dd')
    const expr = cyTemplateExpr(el, 'name')
    if (mode === 'relative') {
      const days = el.templateRelativeDays ?? 0
      return `${meta} — recomputed relative to the run day\n  ${el.name}() {\n    const name = format(addDays(startOfToday(), ${days}), ${pattern}, { locale: ${loc} });\n    return ${expr};\n  }`
    }
    return `${meta}\n  ${el.name}(date) {\n    const name = format(date, ${pattern}, { locale: ${loc} });\n    return ${expr};\n  }`
  }

  return `${meta}\n  ${el.name}(value) {\n    return ${cyTemplateExpr(el, 'value')};\n  }`
}

/** Timezone-safe `new Date(y, m, d)` constructor source for an ISO calendar date. */
function dateCtorFromIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `new Date(${y}, ${(m ?? 1) - 1}, ${d ?? 1})`
}

/** Call expression for a template element when no method parameter is in scope. */
function templateCallExpr(el: IRElement): string {
  const t = el.template
  const mode = el.templateParamMode ?? 'param'
  if (!t || mode !== 'param') return `this.${el.name}()`
  if (t.kind === 'date' && t.capturedNormalized) {
    return `this.${el.name}(${dateCtorFromIso(t.capturedNormalized)})`
  }
  return `this.${el.name}(${JSON.stringify(t.capturedValue)})`
}

function renderElementGetter(el: IRElement): string {
  if (el.locatorStrategy === 'template' && el.template) {
    const accessor = renderTemplateAccessor(el)
    if (!el.fallbackLocators?.length) return accessor
    const exprs = el.fallbackLocators.map(renderFallbackExpr).join(', ')
    return `${accessor}\n  // Fallbacks: ${exprs}`
  }
  const shadowWarning = el.shadowClosed
    ? `  // WARNING: element is inside a closed shadow root — locator may be unreliable\n`
    : ''
  const primary = `${shadowWarning}  ${el.name}() { return ${renderLocator(el)}; }`
  if (!el.fallbackLocators?.length) return primary
  const exprs = el.fallbackLocators.map(renderFallbackExpr).join(', ')
  const fallbackComment = `  // Fallbacks: ${exprs}`
  return `${primary}\n${fallbackComment}`
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function renderAssertion(d: AssertionDetail, chain: string, indent: string): string {
  switch (d.type) {
    case 'visible':
      return `${indent}${chain}.should('be.visible');`
    case 'hidden':
      return `${indent}${chain}.should('not.be.visible');`
    case 'text':
      return `${indent}${chain}.should('have.text', ${JSON.stringify(d.expected ?? '')});`
    case 'text-contains':
      return `${indent}${chain}.should('contain.text', ${JSON.stringify(d.expected ?? '')});`
    case 'not-empty':
      return `${indent}${chain}.invoke('text').should('not.be.empty');`
    case 'matches':
      return `${indent}${chain}.invoke('text').should('match', new RegExp(${JSON.stringify(String(d.expected ?? ''))}));`
    case 'value':
      return `${indent}${chain}.should('have.value', ${JSON.stringify(d.expected ?? '')});`
    case 'attribute':
      return `${indent}${chain}.should('have.attr', ${JSON.stringify(d.attribute ?? '')}, ${JSON.stringify(d.expected ?? '')});`
    case 'count':
      return `${indent}${chain}.should('have.length', ${Number(d.expected ?? 0)});`
    case 'screenshot': {
      const name = d.name ?? 'snapshot'
      const pct = Math.round((d.threshold ?? 0.02) * 100) / 100
      return `${indent}${chain}.matchImageSnapshot(${JSON.stringify(name)}, { failureThreshold: ${pct}, failureThresholdType: 'percent' });`
    }
  }
}

// ---------------------------------------------------------------------------
// Step rendering inside Page Object methods
// ---------------------------------------------------------------------------

function renderStepInMethod(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}cy.visit(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}${templateCallExpr(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '')
    return `${indent}this.${step.element.name}().clear().type(${expr});`
  }
  if (step.element) {
    const interaction = renderInteraction(step, templateCallExpr(step.element), indent)
    if (interaction) return interaction
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}cy.focused().type(${JSON.stringify(`{${step.key.toLowerCase()}}`)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      const chain =
        step.assertionDetail.type === 'screenshot' || !step.element
          ? 'cy'
          : templateCallExpr(step.element)
      return renderAssertion(step.assertionDetail, chain, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  return ''
}

// ---------------------------------------------------------------------------
// Inferred methods (e.g. login(email, password))
// ---------------------------------------------------------------------------

function paramSlug(elementName: string): string {
  const base = elementName.replace(
    /Input$|Button$|Btn$|Link$|Select$|Field$|Box$|Toggle$|Checkbox$|Radio$/,
    '',
  )
  return base.charAt(0).toLowerCase() + base.slice(1)
}

function renderInferredMethod(method: InferredMethod): string {
  const paramList = method.params.join(', ')
  const bodyLines = method.steps
    .map((s) => {
      // A click on a template element receives the data value as a parameter.
      if (s.action === 'click' && s.element?.template) {
        const param = s.element.template.kind === 'date' ? 'date' : 'value'
        const paramIdx = method.params.indexOf(param)
        if (paramIdx !== -1) {
          return `    this.${s.element.name}(${method.params[paramIdx]}).click();`
        }
      }
      if (s.action === 'fill' && s.element) {
        const baseName = s.element.name.replace(/Input$|Button$|Link$|Select$/, '')
        const param = baseName.charAt(0).toLowerCase() + baseName.slice(1)
        const paramIdx = method.params.indexOf(param)
        if (paramIdx !== -1) {
          return `    this.${s.element.name}().clear().type(${method.params[paramIdx]});`
        }
      }
      if (s.action === 'select' && s.element) {
        const paramIdx = method.params.indexOf(paramSlug(s.element.name))
        if (paramIdx !== -1) {
          const chain = templateCallExpr(s.element)
          return renderInteraction(s, chain, '    ', method.params[paramIdx])
        }
      }
      if ((s.action === 'check' || s.action === 'uncheck') && s.element) {
        const paramIdx = method.params.indexOf(paramSlug(s.element.name))
        if (paramIdx !== -1 && method.paramTypes?.[paramIdx] === 'boolean') {
          return renderToggleByParam(templateCallExpr(s.element), method.params[paramIdx]!, '    ')
        }
      }
      return renderStepInMethod(s, '    ')
    })
    .filter(Boolean)
    .join('\n')

  return `  ${method.name}(${paramList}) {\n${bodyLines}\n  }`
}

// ---------------------------------------------------------------------------
// Page Object class
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
  return `import { ${fnList} } from 'date-fns';\nimport { ${localeList} } from 'date-fns/locale';\n\n`
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
      methodsBlock = `\n  performSteps() {\n${stepLines}\n  }`
    }
  }

  const collisionComment = page.collisionWarning
    ? `  // WARNING: Multiple pages share this URL pattern (${page.normalizedUrl}) with different titles.\n`
    : ''

  return `${renderDateFnsImports(page)}export class ${page.className} {
${elementGetters}

${collisionComment}  visit() {
    cy.visit(${JSON.stringify(gotoUrl)});
    return this;
  }
${methodsBlock}
}
`
}
