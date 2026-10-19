import type { InferredMethod, IRPage, IRScenario, IRStep, IRParamType } from '../ir/types'
import { urlStaticPrefix } from '../shared/url-assertion'

export type GherkinKeyword = 'Given' | 'When' | 'Then' | 'And'

export interface GherkinStep {
  keyword: GherkinKeyword
  /** Full Gherkin line (without the leading keyword). Inline values are double-quoted. */
  text: string
  /** Cucumber step-definition pattern: same shape as `text` but values are `{string}` / `{int}` / `{float}` placeholders. */
  pattern: string
  /** Parameter values (parallel to placeholders, in left-to-right order). */
  params: Array<string | number | boolean>
  /** TS-level type for each parameter (used by adapters to type step args). */
  paramTypes: IRParamType[]
  /** Page that owns this step — adapters use it to instantiate the right POM. */
  page?: IRPage
  /** Inferred method backing this step (when method-level mapping was used). */
  method?: InferredMethod
  /** Raw IR steps backing this step (used by adapters for step bodies). */
  sourceSteps: IRStep[]
}

export interface GherkinScenario {
  name: string
  steps: GherkinStep[]
}

export interface GherkinFeature {
  name: string
  scenarios: GherkinScenario[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ASSERTION_ACTIONS = new Set(['assert'])
const SKIPPABLE_ACTIONS = new Set(['network', 'wait'])

function placeholderForType(t: IRParamType): string {
  if (t === 'number') return '{int}'
  if (t === 'boolean') return '{string}'
  return '{string}'
}

function renderValueLiteral(v: string | number | boolean): string {
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return JSON.stringify(String(v))
  return JSON.stringify(v)
}

function humanizeIdentifier(raw: string): string {
  // Camel/Pascal → space-separated words; strip common element-role suffixes.
  const stripped = raw.replace(
    /(Input|Button|Btn|Link|Select|Field|Box|Toggle|Checkbox|Radio)$/,
    '',
  )
  const spaced = stripped
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced || raw
}

function elementRoleLabel(tagName: string | undefined, inputType?: string): string {
  if (inputType === 'checkbox') return 'checkbox'
  if (inputType === 'radio') return 'radio button'
  if (tagName === 'button') return 'button'
  if (tagName === 'a') return 'link'
  if (tagName === 'select') return 'dropdown'
  if (tagName === 'input' || tagName === 'textarea') return 'field'
  return 'element'
}

function elementDisplayName(step: IRStep): string {
  const el = step.element
  if (!el) return 'element'
  const snap = el.elementSnapshot
  const text = snap?.textContent?.trim()
  if (text && text.length > 0 && text.length <= 40) return text
  return humanizeIdentifier(el.name)
}

// ---------------------------------------------------------------------------
// Method → Gherkin line
// ---------------------------------------------------------------------------

interface NamedTemplate {
  keyword: GherkinKeyword
  /** `text` and `pattern` are returned by `render` since both depend on values. */
  render: (method: InferredMethod) => { text: string; pattern: string }
}

const METHOD_TEMPLATES: Record<string, NamedTemplate> = {
  login: {
    keyword: 'When',
    render: (m) => ({
      text: `I log in with email ${quoted(m, 0)} and password ${quoted(m, 1)}`,
      pattern: `I log in with email ${ph(m, 0)} and password ${ph(m, 1)}`,
    }),
  },
  register: {
    keyword: 'When',
    render: (m) => ({
      text: `I register with email ${quoted(m, 0)} and password ${quoted(m, 1)}`,
      pattern: `I register with email ${ph(m, 0)} and password ${ph(m, 1)}`,
    }),
  },
  search: {
    keyword: 'When',
    render: (m) => ({
      text: `I search for ${quoted(m, 0)}`,
      pattern: `I search for ${ph(m, 0)}`,
    }),
  },
  submitForm: {
    keyword: 'When',
    render: (m) => ({
      text: m.params.length
        ? `I submit the form with ${m.params.map((_, i) => quoted(m, i)).join(' and ')}`
        : 'I submit the form',
      pattern: m.params.length
        ? `I submit the form with ${m.params.map((_, i) => ph(m, i)).join(' and ')}`
        : 'I submit the form',
    }),
  },
  fillForm: {
    keyword: 'When',
    render: (m) => ({
      text: m.params.length
        ? `I fill the form with ${m.params.map((_, i) => quoted(m, i)).join(' and ')}`
        : 'I fill the form',
      pattern: m.params.length
        ? `I fill the form with ${m.params.map((_, i) => ph(m, i)).join(' and ')}`
        : 'I fill the form',
    }),
  },
  acceptAndSubmit: {
    keyword: 'When',
    render: () => ({
      text: 'I accept and submit',
      pattern: 'I accept and submit',
    }),
  },
  selectFromMenu: {
    keyword: 'When',
    render: (m) => ({
      text: `I select ${quoted(m, 0)} from the menu`,
      pattern: `I select ${ph(m, 0)} from the menu`,
    }),
  },
  navigateFromMenu: {
    keyword: 'When',
    render: (m) => ({
      text: `I navigate to ${quoted(m, 0)} from the menu`,
      pattern: `I navigate to ${ph(m, 0)} from the menu`,
    }),
  },
  openItem: {
    keyword: 'When',
    render: (m) => ({
      text: `I open ${quoted(m, 0)}`,
      pattern: `I open ${ph(m, 0)}`,
    }),
  },
  confirmAction: {
    keyword: 'When',
    render: (m) => ({
      text: `I confirm ${quoted(m, 0)}`,
      pattern: `I confirm ${ph(m, 0)}`,
    }),
  },
  awaitNetwork: {
    keyword: 'When',
    render: () => ({
      text: 'I wait for the network response',
      pattern: 'I wait for the network response',
    }),
  },
}

/** Steps whose recorded `value` feeds an inferred method parameter. */
function isValueStep(step: IRStep): boolean {
  return step.action === 'fill' || step.action === 'select'
}

function paramValueFromStep(method: InferredMethod, idx: number): string {
  const step = method.steps.find((s) => isValueStep(s) && s.element)
  return step?.value ?? `value${idx + 1}`
}

function quoted(method: InferredMethod, idx: number): string {
  const fillSteps = method.steps.filter(isValueStep)
  const value = fillSteps[idx]?.value ?? paramValueFromStep(method, idx)
  return renderValueLiteral(value)
}

function ph(method: InferredMethod, idx: number): string {
  const t = method.paramTypes?.[idx] ?? 'string'
  return placeholderForType(t)
}

/**
 * Resolve the template for an inferred method. Names with numeric collision
 * suffixes (`login2`, `search3`) fall back to their base template.
 */
function resolveTemplate(method: InferredMethod): NamedTemplate {
  const directBase = method.name.replace(/\d+$/, '')
  const t = METHOD_TEMPLATES[directBase] ?? METHOD_TEMPLATES[method.name]
  if (t) return t
  return defaultMethodTemplate(method)
}

function defaultMethodTemplate(method: InferredMethod): NamedTemplate {
  const name = method.name
  if (name.startsWith('click')) {
    const subject = humanizeIdentifier(name.slice('click'.length)).toLowerCase() || 'element'
    return {
      keyword: 'When',
      render: () => ({
        text: `I click the ${JSON.stringify(subject)} element`,
        pattern: `I click the ${JSON.stringify(subject)} element`,
      }),
    }
  }
  if (name.startsWith('fill')) {
    const subject = humanizeIdentifier(name.slice('fill'.length)).toLowerCase() || 'field'
    return {
      keyword: 'When',
      render: (m) => {
        const value = m.params.length ? quoted(m, 0) : '""'
        // The subject is part of the pattern so every field gets its own step
        // definition; only the value is a placeholder (one placeholder = one param).
        const placeholder = m.params.length ? ph(m, 0) : '""'
        return {
          text: `I fill the ${JSON.stringify(subject)} field with ${value}`,
          pattern: `I fill the ${JSON.stringify(subject)} field with ${placeholder}`,
        }
      },
    }
  }
  if (name.startsWith('select') && method.params.length > 0) {
    const subject = humanizeIdentifier(name.slice('select'.length)).toLowerCase() || 'option'
    return {
      keyword: 'When',
      render: (m) => ({
        text: `I select ${quoted(m, 0)} from the ${subject}`,
        pattern: `I select ${ph(m, 0)} from the ${subject}`,
      }),
    }
  }
  const toggleVerbs: Array<[prefix: string, verb: string, fallback: string]> = [
    ['uncheck', 'uncheck', 'option'],
    ['check', 'check', 'option'],
    ['upload', 'upload a file to', 'field'],
    ['hover', 'hover over', 'element'],
    ['doubleClick', 'double-click', 'element'],
  ]
  for (const [prefix, verb, fallback] of toggleVerbs) {
    if (!name.startsWith(prefix)) continue
    const subject = humanizeIdentifier(name.slice(prefix.length)).toLowerCase() || fallback
    return {
      keyword: 'When',
      render: () => ({ text: `I ${verb} the ${subject}`, pattern: `I ${verb} the ${subject}` }),
    }
  }
  if (name.startsWith('press')) {
    const key = name.slice('press'.length).toLowerCase() || 'enter'
    return {
      keyword: 'When',
      render: () => ({
        text: `I press ${JSON.stringify(key)}`,
        pattern: `I press ${JSON.stringify(key)}`,
      }),
    }
  }
  if (name.startsWith('verify')) {
    const subject = humanizeIdentifier(name.slice('verify'.length)).toLowerCase() || 'state'
    return {
      keyword: 'Then',
      render: () => ({
        text: `I verify the ${JSON.stringify(subject)}`,
        pattern: `I verify the ${JSON.stringify(subject)}`,
      }),
    }
  }
  // Generic catch-all: humanize the method name as the action description.
  return {
    keyword: 'When',
    render: () => ({
      text: `I ${humanizeIdentifier(name).toLowerCase()}`,
      pattern: `I ${humanizeIdentifier(name).toLowerCase()}`,
    }),
  }
}

// ---------------------------------------------------------------------------
// Per-step mapping (used when InferredMethod doesn't apply)
// ---------------------------------------------------------------------------

type CanonicalKeyword = 'Given' | 'When' | 'Then'

/**
 * Heuristic keyword assignment for a single IR step. Each step is canonically
 * one of `Given/When/Then` (assigned by action); the emitted keyword is `And`
 * when the canonical keyword matches the previous canonical keyword.
 */
function canonicalFor(action: IRStep['action'], isFirst: boolean): CanonicalKeyword {
  if (ASSERTION_ACTIONS.has(action)) return 'Then'
  if (isFirst && action === 'navigate') return 'Given'
  return 'When'
}

function emit(canonical: CanonicalKeyword, previous: CanonicalKeyword | null): GherkinKeyword {
  if (previous === null) return canonical
  return previous === canonical ? 'And' : canonical
}

export type LiteralLanguage = 'js' | 'python' | 'java'

/**
 * Literal call arguments for the method parameters a step's pattern has no
 * placeholder for (e.g. the boolean of `acceptAndSubmit`) — the step
 * definition still has to pass them, or the call has the wrong arity.
 */
export function literalArgsFor(
  step: GherkinStep,
  placeholderCount: number,
  language: LiteralLanguage,
): string[] {
  const total = step.method?.params.length ?? 0
  const out: string[] = []
  for (let i = placeholderCount; i < total; i++) {
    const raw = step.params[i]
    const type = step.paramTypes[i] ?? 'string'
    if (type === 'boolean') {
      const on = raw === true || raw === 'true' || raw === 'on'
      out.push(language === 'python' ? (on ? 'True' : 'False') : String(on))
    } else if (type === 'number') {
      out.push(String(Number(raw) || 0))
    } else {
      out.push(JSON.stringify(String(raw ?? '')))
    }
  }
  return out
}

/** Joins several uploaded file names into the single string parameter of the step. */
export const UPLOAD_FILE_SEPARATOR = ', '

/** Map a single IR step to a Gherkin step (used for step-level scenarios). */
export function mapIRStepToGherkin(step: IRStep, keyword: GherkinKeyword): GherkinStep {
  if (step.action === 'navigate' && step.url) {
    return {
      keyword,
      text: `I am on the page ${JSON.stringify(step.url)}`,
      pattern: 'I am on the page {string}',
      params: [step.url],
      paramTypes: ['string'],
      sourceSteps: [step],
    }
  }
  if (step.action === 'click' && step.element) {
    const role = elementRoleLabel(step.element.tagName, step.element.inputType)
    const label = elementDisplayName(step)
    return {
      keyword,
      text: `I click the ${JSON.stringify(label)} ${role}`,
      pattern: `I click the {string} ${role}`,
      params: [label],
      paramTypes: ['string'],
      sourceSteps: [step],
    }
  }
  if (step.action === 'fill' && step.element) {
    const role = elementRoleLabel(step.element.tagName, step.element.inputType)
    const label = elementDisplayName(step)
    const value = step.value ?? ''
    return {
      keyword,
      text: `I fill the ${JSON.stringify(label)} ${role} with ${JSON.stringify(value)}`,
      pattern: `I fill the {string} ${role} with {string}`,
      params: [label, value],
      paramTypes: ['string', 'string'],
      sourceSteps: [step],
    }
  }
  if (step.action === 'select' && step.element) {
    const role = elementRoleLabel(step.element.tagName, step.element.inputType)
    const label = elementDisplayName(step)
    const value = step.value ?? ''
    return {
      keyword,
      text: `I select ${JSON.stringify(value)} from the ${JSON.stringify(label)} ${role}`,
      pattern: `I select {string} from the {string} ${role}`,
      params: [value, label],
      paramTypes: ['string', 'string'],
      sourceSteps: [step],
    }
  }
  if (step.action === 'upload' && step.element && step.upload) {
    const role = elementRoleLabel(step.element.tagName, step.element.inputType)
    const label = elementDisplayName(step)
    const files = step.upload.fileNames.join(UPLOAD_FILE_SEPARATOR)
    return {
      keyword,
      text: `I upload ${JSON.stringify(files)} to the ${JSON.stringify(label)} ${role}`,
      pattern: `I upload {string} to the {string} ${role}`,
      params: [files, label],
      paramTypes: ['string', 'string'],
      sourceSteps: [step],
    }
  }
  const elementVerbs: Partial<Record<IRStep['action'], string>> = {
    check: 'check',
    uncheck: 'uncheck',
    hover: 'hover over',
    dblclick: 'double-click',
  }
  const elementVerb = elementVerbs[step.action]
  if (elementVerb && step.element) {
    const role = elementRoleLabel(step.element.tagName, step.element.inputType)
    const label = elementDisplayName(step)
    return {
      keyword,
      text: `I ${elementVerb} the ${JSON.stringify(label)} ${role}`,
      pattern: `I ${elementVerb} the {string} ${role}`,
      params: [label],
      paramTypes: ['string'],
      sourceSteps: [step],
    }
  }
  if (step.action === 'keypress' && step.key) {
    return {
      keyword,
      text: `I press ${JSON.stringify(step.key)}`,
      pattern: 'I press {string}',
      params: [step.key],
      paramTypes: ['string'],
      sourceSteps: [step],
    }
  }
  if (step.action === 'assert' && step.assertionDetail) {
    const d = step.assertionDetail
    const subject = step.element ? elementDisplayName(step) : 'page'
    const role = step.element ? elementRoleLabel(step.element.tagName, step.element.inputType) : ''
    const roleSuffix = role && role !== 'element' ? ` ${role}` : ''
    if (d.type === 'visible')
      return {
        keyword,
        text: `the ${JSON.stringify(subject)}${roleSuffix} should be visible`,
        pattern: `the {string}${roleSuffix} should be visible`,
        params: [subject],
        paramTypes: ['string'],
        sourceSteps: [step],
      }
    if (d.type === 'hidden')
      return {
        keyword,
        text: `the ${JSON.stringify(subject)}${roleSuffix} should be hidden`,
        pattern: `the {string}${roleSuffix} should be hidden`,
        params: [subject],
        paramTypes: ['string'],
        sourceSteps: [step],
      }
    if (d.type === 'text')
      return {
        keyword,
        text: `the ${JSON.stringify(subject)}${roleSuffix} should have text ${JSON.stringify(String(d.expected ?? ''))}`,
        pattern: `the {string}${roleSuffix} should have text {string}`,
        params: [subject, String(d.expected ?? '')],
        paramTypes: ['string', 'string'],
        sourceSteps: [step],
      }
    if (d.type === 'text-contains')
      return {
        keyword,
        text: `the ${JSON.stringify(subject)}${roleSuffix} should contain ${JSON.stringify(String(d.expected ?? ''))}`,
        pattern: `the {string}${roleSuffix} should contain {string}`,
        params: [subject, String(d.expected ?? '')],
        paramTypes: ['string', 'string'],
        sourceSteps: [step],
      }
    if (d.type === 'value')
      return {
        keyword,
        text: `the ${JSON.stringify(subject)}${roleSuffix} value should be ${JSON.stringify(String(d.expected ?? ''))}`,
        pattern: `the {string}${roleSuffix} value should be {string}`,
        params: [subject, String(d.expected ?? '')],
        paramTypes: ['string', 'string'],
        sourceSteps: [step],
      }
    if (d.type === 'count')
      return {
        keyword,
        text: `I should see ${Number(d.expected ?? 0)} ${JSON.stringify(subject)}${roleSuffix} elements`,
        pattern: `I should see {int} {string}${roleSuffix} elements`,
        params: [Number(d.expected ?? 0), subject],
        paramTypes: ['number', 'string'],
        sourceSteps: [step],
      }
    if (d.type === 'attribute')
      return {
        keyword,
        text: `the ${JSON.stringify(subject)}${roleSuffix} ${JSON.stringify(d.attribute ?? '')} attribute should be ${JSON.stringify(String(d.expected ?? ''))}`,
        pattern: `the {string}${roleSuffix} {string} attribute should be {string}`,
        params: [subject, d.attribute ?? '', String(d.expected ?? '')],
        paramTypes: ['string', 'string', 'string'],
        sourceSteps: [step],
      }
    if (d.type === 'url') {
      const fragment = urlStaticPrefix(String(d.expected ?? ''))
      return {
        keyword,
        text: `the page URL should contain ${JSON.stringify(fragment)}`,
        pattern: 'the page URL should contain {string}',
        params: [fragment],
        paramTypes: ['string'],
        sourceSteps: [step],
      }
    }
    if (d.type === 'screenshot')
      return {
        keyword,
        text: `the page should match screenshot ${JSON.stringify(d.name ?? 'snapshot')}`,
        pattern: `the page should match screenshot {string}`,
        params: [d.name ?? 'snapshot'],
        paramTypes: ['string'],
        sourceSteps: [step],
      }
  }
  // Catch-all (network/wait/etc.): keep a no-op narrative line.
  return {
    keyword,
    text: 'I continue',
    pattern: 'I continue',
    params: [],
    paramTypes: [],
    sourceSteps: [step],
  }
}

// ---------------------------------------------------------------------------
// Method → Gherkin step
// ---------------------------------------------------------------------------

export function mapInferredMethodToGherkin(
  method: InferredMethod,
  page: IRPage,
  previousCanonical: CanonicalKeyword | null,
): GherkinStep {
  const template = resolveTemplate(method)
  const rendered = template.render(method)

  // Derive parameter values (in declaration order) from method.steps.
  const fillSteps = method.steps.filter(isValueStep)
  const toggleStep = method.steps.find((s) => s.action === 'check' || s.action === 'uncheck')
  const values: Array<string | number | boolean> = method.params.map((_, idx) => {
    const t = method.paramTypes?.[idx] ?? 'string'
    const raw = fillSteps[idx]?.value
    if (t === 'number') return raw === undefined ? 0 : Number(raw)
    if (t === 'boolean') {
      if (toggleStep) return toggleStep.action === 'check'
      return raw === undefined ? false : raw === 'true' || raw === 'on'
    }
    return raw ?? ''
  })

  const canonical: CanonicalKeyword = template.keyword === 'Then' ? 'Then' : 'When'
  const keyword = emit(canonical, previousCanonical)

  return {
    keyword,
    text: rendered.text,
    pattern: rendered.pattern,
    params: values,
    paramTypes: method.paramTypes ?? method.params.map(() => 'string'),
    page,
    method,
    sourceSteps: method.steps,
  }
}

// ---------------------------------------------------------------------------
// Scenario → Feature
// ---------------------------------------------------------------------------

/**
 * Build a Gherkin feature from an IR scenario.
 *
 * Strategy:
 *  - Each page with `inferredMethods` contributes one Given (the goto) followed
 *    by one Gherkin step per inferred method (When/Then keyword chosen by the
 *    method template).
 *  - When a page has no inferred methods, individual non-navigate steps are
 *    mapped one-to-one to Gherkin lines.
 *  - `network` / `wait` IR actions are dropped (they're glue, not narrative).
 */
export function mapScenarioToGherkin(scenario: IRScenario): GherkinFeature {
  const steps: GherkinStep[] = []
  let prevCanonical: CanonicalKeyword | null = null

  scenario.pages.forEach((page) => {
    const navStep = page.steps.find((s) => s.action === 'navigate')
    if (navStep) {
      // First page entry is canonically Given; subsequent page transitions
      // inherit the current canonical keyword so they collapse to `And`.
      const canonical: CanonicalKeyword = prevCanonical === null ? 'Given' : prevCanonical
      const keyword = emit(canonical, prevCanonical)
      steps.push({
        keyword,
        text: `I am on the ${JSON.stringify(page.name)} page`,
        pattern: `I am on the {string} page`,
        params: [page.name],
        paramTypes: ['string'],
        page,
        sourceSteps: [navStep],
      })
      prevCanonical = canonical
    }

    if (page.inferredMethods && page.inferredMethods.length > 0) {
      for (const method of page.inferredMethods) {
        const gStep = mapInferredMethodToGherkin(method, page, prevCanonical)
        steps.push(gStep)
        const template = resolveTemplate(method)
        prevCanonical = template.keyword === 'Then' ? 'Then' : 'When'
      }
    } else {
      for (const step of page.steps) {
        if (step.action === 'navigate') continue
        if (SKIPPABLE_ACTIONS.has(step.action)) continue
        const canonical = canonicalFor(step.action, prevCanonical === null)
        const emittedKeyword = emit(canonical, prevCanonical)
        const gStep = mapIRStepToGherkin(step, emittedKeyword)
        gStep.page = page
        steps.push(gStep)
        prevCanonical = canonical
      }
    }
  })

  return {
    name: scenario.name,
    scenarios: [{ name: scenario.name, steps }],
  }
}
