import type { IRStep, IRElement, InferredMethod, IRParamType } from '../ir/types'
import { isSensitiveField } from './sensitive-detector'

// ---------------------------------------------------------------------------
// Element classification helpers
// ---------------------------------------------------------------------------

const SUFFIX_REGEX = /Input$|Button$|Btn$|Link$|Select$|Field$|Box$|Toggle$|Checkbox$|Radio$/

function stripElementSuffix(name: string): string {
  return name.replace(SUFFIX_REGEX, '')
}

function paramName(element: IRElement | undefined, defaultName: string): string {
  if (!element) return defaultName
  const stripped = stripElementSuffix(element.name)
  if (!stripped) return defaultName
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}

function paramTypeFor(el: IRElement | undefined): IRParamType {
  const t = el?.inputType?.toLowerCase()
  if (t === 'number' || t === 'range') return 'number'
  if (t === 'checkbox' || t === 'radio') return 'boolean'
  return 'string'
}

function isSubmitLike(el: IRElement | undefined): boolean {
  if (!el) return false
  const n = el.name.toLowerCase()
  return (
    n.includes('submit') ||
    n.includes('login') ||
    n.includes('signin') ||
    n.includes('signup') ||
    n.includes('register') ||
    n.includes('save') ||
    n.includes('confirm') ||
    n.includes('send') ||
    n.includes('apply') ||
    n.includes('continue') ||
    n.includes('search') ||
    el.tagName === 'button'
  )
}

function isMenuLike(el: IRElement | undefined): boolean {
  if (!el) return false
  const n = el.name.toLowerCase()
  return (
    n.includes('menu') ||
    n.includes('dropdown') ||
    n.includes('nav') ||
    n.includes('more') ||
    n.includes('toggle')
  )
}

function isCheckboxLike(el: IRElement | undefined): boolean {
  const t = el?.inputType?.toLowerCase()
  return t === 'checkbox' || t === 'radio'
}

function isCheckboxToggle(step: IRStep): boolean {
  if (step.action === 'check' || step.action === 'uncheck') return true
  return step.action === 'click' && isCheckboxLike(step.element)
}

function isPasswordField(el: IRElement | undefined): boolean {
  return el?.inputType?.toLowerCase() === 'password' || /password|pwd/i.test(el?.name ?? '')
}

function isRegistrationContext(els: (IRElement | undefined)[]): boolean {
  return els.some((el) => /register|signup|sign-?up|create.?account/i.test(el?.name ?? ''))
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function isTab(step: IRStep | undefined): boolean {
  return step?.action === 'keypress' && step.key === 'Tab'
}

interface FillRun {
  fills: IRStep[]
  /** The fills plus the focus-navigation Tabs between them, in recorded order. */
  steps: IRStep[]
  /** Index of the first user step after the run. */
  end: number
}

/**
 * Collects consecutive fills starting at `start`. A Tab keypress between two fills is focus
 * navigation, not a user action in its own right, so it stays inside the run (and the method
 * body, keeping replay faithful) instead of splitting the form in two.
 */
function collectFillRun(userSteps: IRStep[], start: number): FillRun {
  const fills: IRStep[] = []
  const steps: IRStep[] = []
  let j = start
  while (userSteps[j]?.action === 'fill') {
    const fill = userSteps[j]!
    fills.push(fill)
    steps.push(fill)
    j++
    let k = j
    while (isTab(userSteps[k])) k++
    if (k > j && userSteps[k]?.action === 'fill') {
      steps.push(...userSteps.slice(j, k))
      j = k
    }
  }
  return { fills, steps, end: j }
}

function searchDraft(fill: IRStep, terminator: IRStep): MethodDraft {
  return {
    name: 'search',
    params: [paramName(fill.element, 'query')],
    paramTypes: [paramTypeFor(fill.element)],
    paramSecret: [isSensitiveField(fill.element)],
    paramElements: [fill.element],
    steps: [fill, terminator],
  }
}

/** login / register / submitForm naming for a two-field form. */
function pairFormName(fills: IRStep[], terminator: IRStep): string {
  const [first, second] = fills
  if (isRegistrationContext([first?.element, second?.element, terminator.element]))
    return 'register'
  return isPasswordField(second?.element) ? 'login' : 'submitForm'
}

function formDraft(name: string, fills: IRStep[], steps: IRStep[], pair: boolean): MethodDraft {
  return {
    name,
    params: fills.map((s, idx) =>
      paramName(s.element, pair ? (idx === 0 ? 'email' : 'password') : `field${idx + 1}`),
    ),
    paramTypes: fills.map((s) => paramTypeFor(s.element)),
    paramSecret: fills.map((s) => isSensitiveField(s.element)),
    paramElements: fills.map((s) => s.element),
    steps,
  }
}

// ---------------------------------------------------------------------------
// Default method naming for unmatched steps
// ---------------------------------------------------------------------------

interface MethodDraft {
  name: string
  params: string[]
  paramTypes: IRParamType[]
  /** Aligned with `params` — true when the parameter holds a secret value. */
  paramSecret: boolean[]
  /** Element each param was derived from — used to recompute secret flags. */
  paramElements: (IRElement | undefined)[]
  steps: IRStep[]
}

function emptyDraft(name: string, step: IRStep): MethodDraft {
  return {
    name,
    params: [],
    paramTypes: [],
    paramSecret: [],
    paramElements: [],
    steps: [step],
  }
}

function defaultDraft(step: IRStep): MethodDraft {
  if (step.action === 'click' && step.element) {
    return emptyDraft(
      `click${capitalize(stripElementSuffix(step.element.name) || 'Element')}`,
      step,
    )
  }
  if (step.action === 'fill' && step.element) {
    const param = paramName(step.element, 'value')
    return {
      name: `fill${capitalize(stripElementSuffix(step.element.name) || 'Field')}`,
      params: [param],
      paramTypes: [paramTypeFor(step.element)],
      paramSecret: [isSensitiveField(step.element)],
      paramElements: [step.element],
      steps: [step],
    }
  }
  if (step.action === 'select' && step.element) {
    return {
      name: `select${capitalize(stripElementSuffix(step.element.name) || 'Option')}`,
      params: [paramName(step.element, 'value')],
      paramTypes: ['string'],
      paramSecret: [false],
      paramElements: [step.element],
      steps: [step],
    }
  }
  if (step.action === 'check' || step.action === 'uncheck') {
    const verb = step.action === 'check' ? 'check' : 'uncheck'
    return emptyDraft(
      `${verb}${capitalize(stripElementSuffix(step.element?.name ?? '') || 'Option')}`,
      step,
    )
  }
  if (step.action === 'hover') {
    return emptyDraft(
      `hover${capitalize(stripElementSuffix(step.element?.name ?? '') || 'Element')}`,
      step,
    )
  }
  if (step.action === 'dblclick') {
    return emptyDraft(
      `doubleClick${capitalize(stripElementSuffix(step.element?.name ?? '') || 'Element')}`,
      step,
    )
  }
  if (step.action === 'keypress' && step.key) {
    return emptyDraft(`press${capitalize(step.key.toLowerCase())}`, step)
  }
  if (step.action === 'assert') {
    const target = step.element ? capitalize(stripElementSuffix(step.element.name)) : 'State'
    return emptyDraft(`verify${target || 'State'}`, step)
  }
  if (step.action === 'network') {
    return emptyDraft('awaitNetwork', step)
  }
  return emptyDraft('doAction', step)
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/** Keeps chronology for the usual `action, network, wait` shape: the wait comes last. */
function insertBeforeTrailingWaits(steps: IRStep[], step: IRStep): void {
  let at = steps.length
  while (at > 0 && steps[at - 1]?.action === 'wait') at--
  steps.splice(at, 0, step)
}

/**
 * Infers semantic methods from a sequence of IRSteps.
 *
 * Patterns (priority order, longest match wins):
 *
 *  1. fill + Enter (non-sensitive field)          → search(query)
 *  2. fill + click(submit-like, search-named)     → search(query)
 *  3. 2× fill + click(submit-like) | Enter        → login(email, password) /
 *                                                    register(...) when names hint signup
 *  4. N× fill + click | Enter (N ≥ 2)             → submitForm(...)
 *  5. N× fill (terminal, no click)                → fillForm(...)
 *
 * A Tab between two fills (or between the last fill and the submit click) is focus
 * navigation: it stays in the method body but never splits a fill run.
 *  6. click(checkbox|radio) + click(submit-like)  → acceptAndSubmit(consent)
 *  7. click(menu-like) + click + navigate         → navigateFromMenu(option)
 *  8. click(menu-like) + click                    → selectFromMenu(option)
 *  9. click + navigate                            → openItem(name)
 * 10. click + click(submit-like)                  → confirmAction(name)
 *
 * Anything else falls back to a best-effort name (clickX / fillX / pressY / verifyX).
 * Network steps are kept inline (they are not user actions) so they still appear in
 * the method body and feed the mock generator.
 *
 * Method names collide-resolve per page: duplicates get numeric suffixes.
 */
export function inferMethods(steps: IRStep[]): InferredMethod[] {
  // Strip out network steps for matching but stitch them back into the matched
  // method body so the adapter can render mocks alongside the user actions.
  const userSteps = steps.filter((s) => s.action !== 'network')
  const networkSteps = steps.filter((s) => s.action === 'network')

  const drafts: MethodDraft[] = []
  let i = 0

  while (i < userSteps.length) {
    const s0 = userSteps[i]
    const s1 = userSteps[i + 1]
    const s2 = userSteps[i + 2]

    // Skip lone navigate steps — handled by Page Object goto()
    if (s0?.action === 'navigate') {
      i++
      continue
    }

    // An auto-detected wait belongs to the action it follows; on its own it is not a method.
    if (s0?.action === 'wait') {
      drafts[drafts.length - 1]?.steps.push(s0)
      i++
      continue
    }

    // 0: click on a template (parameterized data-value) element → select method.
    // Intercepted BEFORE pattern matching so a templated click is never
    // swallowed parameterless into openItem/confirmAction shapes.
    if (
      s0?.action === 'click' &&
      s0.element?.template &&
      (s0.element.templateParamMode ?? 'param') === 'param'
    ) {
      const isDate = s0.element.template.kind === 'date'
      drafts.push({
        name: `select${capitalize(stripElementSuffix(s0.element.name) || 'Item')}`,
        params: [isDate ? 'date' : 'value'],
        paramTypes: [isDate ? 'date' : 'string'],
        paramSecret: [false],
        paramElements: [s0.element],
        steps: [s0],
      })
      i++
      continue
    }

    // 0b: click on a container-composed element in `param` mode → select method
    // whose parameter is the row's disambiguating label (e.g. selectPriceCell(name)).
    if (
      s0?.action === 'click' &&
      s0.element?.composed?.anchor.kind === 'container' &&
      s0.element.composedParamMode === 'param' &&
      s0.element.composed.anchor.filterText
    ) {
      drafts.push({
        name: `select${capitalize(stripElementSuffix(s0.element.name) || 'Item')}`,
        params: ['name'],
        paramTypes: ['string'],
        paramSecret: [false],
        paramElements: [s0.element],
        steps: [s0],
      })
      i++
      continue
    }

    // 1: fill + Enter → search. A secret field (password, email, token…) is never a search
    // query, and a fill that follows another fill belongs to a form, not a search box.
    if (
      s0?.action === 'fill' &&
      s1?.action === 'keypress' &&
      s1.key === 'Enter' &&
      !isSensitiveField(s0.element)
    ) {
      drafts.push(searchDraft(s0, s1))
      i += 2
      continue
    }

    // 2: fill + click(search button) → search
    if (
      s0?.action === 'fill' &&
      s1?.action === 'click' &&
      isSubmitLike(s1.element) &&
      /search|find|lookup/i.test(s0.element?.name ?? '')
    ) {
      drafts.push(searchDraft(s0, s1))
      i += 2
      continue
    }

    // 3 / 4 / 5: N× fill (Tab-separated fills count as one run) + optional terminator
    //   2× fill + click(submit-like)  → login / register / submitForm
    //   2× fill + Enter               → login / register / submitForm
    //   N× fill + click               → submitForm
    //   N× fill + Enter (N ≥ 2)       → submitForm
    //   N× fill, no terminator        → fillForm
    if (s0?.action === 'fill') {
      const run = collectFillRun(userSteps, i)
      const { fills } = run
      let j = run.end
      // A Tab that moves focus onto the submit control before it is clicked is still navigation.
      let k = j
      while (isTab(userSteps[k])) k++
      const tabsBeforeClick = userSteps[k]?.action === 'click' ? userSteps.slice(j, k) : []
      const next = userSteps[j + tabsBeforeClick.length]
      const formSteps = [...run.steps, ...tabsBeforeClick]

      if (next?.action === 'click') {
        const isPair = fills.length === 2 && isSubmitLike(next.element)
        drafts.push(
          formDraft(
            isPair ? pairFormName(fills, next) : 'submitForm',
            fills,
            [...formSteps, next],
            isPair,
          ),
        )
        i = j + tabsBeforeClick.length + 1
        continue
      }
      if (fills.length >= 2 && next?.action === 'keypress' && next.key === 'Enter') {
        const isPair = fills.length === 2
        drafts.push(
          formDraft(
            isPair ? pairFormName(fills, next) : 'submitForm',
            fills,
            [...run.steps, next],
            isPair,
          ),
        )
        i = j + 1
        continue
      }
      if (fills.length >= 2) {
        drafts.push(formDraft('fillForm', fills, run.steps, false))
        i = j
        continue
      }
      // single trailing fill — fall through to default naming
    }

    // 6: checkbox (click or check/uncheck) + click(submit) → acceptAndSubmit
    if (s0 && isCheckboxToggle(s0) && s1?.action === 'click' && isSubmitLike(s1.element)) {
      drafts.push({
        name: 'acceptAndSubmit',
        params: [paramName(s0.element, 'consent')],
        paramTypes: ['boolean'],
        paramSecret: [false],
        paramElements: [s0.element],
        steps: [s0, s1],
      })
      i += 2
      continue
    }

    // 7: menu + click + navigate → navigateFromMenu
    if (
      s0?.action === 'click' &&
      isMenuLike(s0.element) &&
      s1?.action === 'click' &&
      s2?.action === 'navigate'
    ) {
      drafts.push({
        name: 'navigateFromMenu',
        params: [paramName(s1.element, 'option')],
        paramTypes: ['string'],
        paramSecret: [false],
        paramElements: [s1.element],
        steps: [s0, s1, s2],
      })
      i += 3
      continue
    }

    // 8: menu + click → selectFromMenu
    if (s0?.action === 'click' && isMenuLike(s0.element) && s1?.action === 'click') {
      drafts.push({
        name: 'selectFromMenu',
        params: [paramName(s1.element, 'option')],
        paramTypes: ['string'],
        paramSecret: [false],
        paramElements: [s1.element],
        steps: [s0, s1],
      })
      i += 2
      continue
    }

    // 9: click + navigate → openItem
    if (s0?.action === 'click' && s1?.action === 'navigate') {
      drafts.push({
        name: 'openItem',
        params: [paramName(s0.element, 'itemName')],
        paramTypes: ['string'],
        paramSecret: [false],
        paramElements: [s0.element],
        steps: [s0, s1],
      })
      i += 2
      continue
    }

    // 10: click + click(submit-like) → confirmAction
    if (s0?.action === 'click' && s1?.action === 'click' && isSubmitLike(s1.element)) {
      drafts.push({
        name: 'confirmAction',
        params: [paramName(s0.element, 'target')],
        paramTypes: ['string'],
        paramSecret: [false],
        paramElements: [s0.element],
        steps: [s0, s1],
      })
      i += 2
      continue
    }

    // Fallback — best-effort default naming
    if (s0) drafts.push(defaultDraft(s0))
    i++
  }

  // Re-thread network steps next to the closest preceding user step in the same method.
  // For simplicity we append all network steps to the method whose last step's
  // index in the original `steps` array is just before the network step. If no
  // user method precedes it, we drop them into the first method (or create one).
  if (networkSteps.length > 0) {
    const indexOf = new Map<IRStep, number>()
    steps.forEach((s, idx) => indexOf.set(s, idx))
    for (const net of networkSteps) {
      const netIdx = indexOf.get(net) ?? 0
      let owner: MethodDraft | undefined
      for (const d of drafts) {
        // Trailing waits come after the network call they wait for, so they must not count.
        const lastAction = [...d.steps].reverse().find((s) => s.action !== 'wait') ?? d.steps[0]!
        const lastIdx = indexOf.get(lastAction) ?? -1
        if (lastIdx <= netIdx) owner = d
      }
      if (!owner) {
        owner = drafts[0]
      }
      if (owner) insertBeforeTrailingWaits(owner.steps, net)
      else
        drafts.push({
          name: 'awaitNetwork',
          params: [],
          paramTypes: [],
          paramSecret: [],
          paramElements: [],
          steps: [net],
        })
    }
  }

  // Collision resolution — append numeric suffixes when names repeat.
  const used = new Set<string>()
  return drafts.map((d) => {
    let candidate = d.name
    let n = 2
    while (used.has(candidate)) {
      candidate = `${d.name}${n++}`
    }
    used.add(candidate)
    return {
      name: candidate,
      params: d.params,
      paramTypes: d.paramTypes,
      paramSecret: d.paramSecret,
      steps: d.steps,
    }
  })
}
