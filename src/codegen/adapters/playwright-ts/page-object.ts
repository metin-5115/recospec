import type { IRPage, InferredMethod } from '../../ir/types'
import { dateFnsLocaleImportName } from '@shared/date-template'
import { isContainerParam, renderElementGetter } from './locator'
import { renderStepInMethod } from './step'
import type { RenderOptions } from '../registry'

const PARAM_SUFFIX_REGEX = /Input$|Button$|Btn$|Link$|Select$|Field$|Box$|Toggle$|Checkbox$|Radio$/

function paramSlugFromElement(name: string): string {
  const stripped = name.replace(PARAM_SUFFIX_REGEX, '')
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}

function tsType(t: string | undefined): string {
  return t === 'date' ? 'Date' : (t ?? 'string')
}

function renderInferredMethod(method: InferredMethod, options: RenderOptions): string {
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
      return renderStepInMethod(s, '    ', options)
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

export function renderPageObject(page: IRPage, options: RenderOptions = {}): string {
  const elementGetters = page.elements.map(renderElementGetter).join('\n\n')

  const gotoStep = page.steps.find((s) => s.action === 'navigate')
  const gotoUrl = gotoStep?.url ?? page.normalizedUrl

  let methodsBlock = ''
  if (page.inferredMethods?.length) {
    methodsBlock =
      '\n' + page.inferredMethods.map((m) => renderInferredMethod(m, options)).join('\n\n')
  } else {
    const stepLines = page.steps
      .filter((s) => s.action !== 'navigate')
      .map((s) => renderStepInMethod(s, '    ', options))
      .filter(Boolean)
      .join('\n')
    if (stepLines) {
      methodsBlock = `\n  async performSteps() {\n${stepLines}\n  }`
    }
  }

  const collisionComment = page.collisionWarning
    ? `  // WARNING: Multiple pages share this URL pattern (${page.normalizedUrl}) with different titles.\n`
    : ''

  const playwrightImport = /\bexpect\(/.test(methodsBlock)
    ? "import { expect, type Page } from '@playwright/test';"
    : "import { type Page } from '@playwright/test';"

  return `${playwrightImport}
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
