import type { IRElement, IRFallback } from '../../ir/types'
import { dateFnsLocaleImportName } from '@shared/date-template'

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
export function isContainerParam(el: IRElement): boolean {
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
export function memberExpr(el: IRElement): string {
  if (isContainerParam(el))
    return `this.${el.name}(${JSON.stringify(el.composed!.anchor.filterText)})`
  return templateMemberExpr(el)
}

export function renderElementGetter(el: IRElement): string {
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
