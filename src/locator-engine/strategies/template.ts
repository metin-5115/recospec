import type { Locator, TemplateSpec } from '@shared/types/locator'
import { classifyText } from '@shared/text-classifier'
import { inferDateTemplate, localeIdsForLang } from '@shared/date-template'
import { computeAccessibleName } from './accessible-name'
import { findStableAnchor } from './composed'
import { selectorForRole } from './role-table'

/**
 * Template locator production — the answer to the date/data problem. When an
 * element's only usable identity is a data value (a calendar cell's
 * accessible name, a row keyed by an entity name), every raw embedding is
 * constraint-rejected; this strategy converts that identity into a
 * PARAMETERIZED template instead:
 *
 *   '12 Ağustos 2026 Çarşamba'  →  {date:d MMMM yyyy EEEE:tr}
 *   'Concorde Aria Hotel'       →  {param:value}
 *
 * Codegen renders the template as a parameterized page-object method, so the
 * generated POM contains NO hardcoded data value.
 */

function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"')) return `"${value}"`
  const parts = value.split("'").map((p) => `'${p}'`)
  return `concat(${parts.join(`, "'", `)})`
}

function explicitOrImplicitRole(el: Element): string | null {
  const explicit = el.getAttribute('role')?.trim()
  if (explicit) return explicit
  for (const role of ['button', 'link', 'gridcell', 'cell', 'option', 'tab', 'menuitem']) {
    try {
      if (el.matches(selectorForRole(role))) return role
    } catch {
      // A role selector this DOM implementation cannot parse: try the next role.
    }
  }
  return null
}

function normText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

export interface TemplateOptions {
  composedPath?: readonly EventTarget[]
  /** The element's text mutated during the session — volatile, not templatable. */
  mutated?: boolean
}

/**
 * Build a template candidate for an element whose accessible name / text is a
 * data value, or `null` when the text is stable (no template needed), empty,
 * or volatile (mutating values cannot be parameterized meaningfully).
 */
export function buildTemplateCandidate(
  el: Element,
  doc: Document,
  options: TemplateOptions = {},
): Locator | null {
  const role = explicitOrImplicitRole(el)
  const ariaLabel = el.getAttribute('aria-label')?.trim()
  const name = normText(role ? computeAccessibleName(el, doc, role) : (ariaLabel ?? el.textContent))
  if (!name) return null

  const classification = classifyText(name, {
    role,
    mutated: options.mutated,
    locale: doc.documentElement.lang || undefined,
  })
  if (classification !== 'data-value') return null

  // Prefer the document language — "August" parses in both en and de, and only
  // the page's declared locale disambiguates which formatting rules apply.
  const docLang = doc.documentElement.lang || ''
  const preferred = localeIdsForLang(docLang)
  const dateTemplate =
    (preferred.length ? inferDateTemplate(name, preferred) : null) ?? inferDateTemplate(name)
  const kind: TemplateSpec['kind'] = dateTemplate ? 'date' : 'param'
  const nameTemplate = dateTemplate
    ? `{date:${dateTemplate.pattern}:${dateTemplate.localeId}}`
    : '{param:value}'

  const scope = findStableAnchor(el, doc, options.composedPath) ?? undefined

  // A non-date data value (price, count) on a ROLELESS element is never a good
  // primary identity:
  //   - with no scope, it would render as `getByText(dynamicValue)` — the exact
  //     fragile thing we reject; the composed container anchor (row keyed by a
  //     stable sibling label) is the right answer.
  //   - with a scope (e.g. a test-id card), the element is locatable structurally
  //     (`getByTestId(card).locator('.price')`) WITHOUT its volatile value, which
  //     honours "elements under a test-id are taken directly". The template's own
  //     `getByRole(tag, …)` expression is invalid for a non-role tag anyway.
  // Declining here lets the composed/flat candidate win. Date templates and
  // role-bearing values (e.g. a button labelled by a price) are unaffected.
  if (kind === 'param' && !role) return null

  const tag = el.tagName.toLowerCase()
  const strategy: TemplateSpec['strategy'] = role ? 'role-name' : ariaLabel ? 'aria-label' : 'text'

  const targetXPath = `//${tag}[normalize-space()=${xpathLiteral(name)}]`
  const xpath = scope ? `${scope.xpath}${targetXPath}` : targetXPath

  const spec: TemplateSpec = {
    strategy,
    role: role ?? undefined,
    nameTemplate,
    capturedValue: name,
    capturedNormalized: dateTemplate?.iso,
    kind,
    pattern: dateTemplate?.pattern,
    localeId: dateTemplate?.localeId,
    scope,
    xpath,
  }

  const human = role
    ? `${role}[name=${nameTemplate}]`
    : strategy === 'aria-label'
      ? `[aria-label=${nameTemplate}]`
      : `text=${nameTemplate}`

  return {
    strategy: 'template',
    selector: scope ? `${scope.kind}=${scope.value} >> ${human}` : human,
    template: spec,
    framework: {
      playwright: `/* parameterized */ page.getByRole(${JSON.stringify(role ?? tag)}, { name: ${nameTemplate} })`,
    },
  }
}
