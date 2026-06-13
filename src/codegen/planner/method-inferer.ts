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

function isPasswordField(el: IRElement | undefined): boolean {
  return el?.inputType?.toLowerCase() === 'password' || /password|pwd/i.test(el?.name ?? '')
}

function isRegistrationContext(els: (IRElement | undefined)[]): boolean {
  return els.some((el) => /register|signup|sign-?up|create.?account/i.test(el?.name ?? ''))
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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

/**
 * Infers semantic methods from a sequence of IRSteps.
 *
 * Patterns (priority order, longest match wins):
 *
 *  1. fill + Enter                                → search(query)
 *  2. fill + click(submit-like, search-named)     → search(query)
 *  3. 2× fill + click(submit-like)                → login(email, password) /
 *                                                    register(...) when names hint signup
 *  4. N× fill + click                             → submitForm(...)
 *  5. N× fill (terminal, no click)                → fillForm(...)
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

    // 1: fill + Enter → search
    if (s0?.action === 'fill' && s1?.action === 'keypress' && s1.key === 'Enter') {
      drafts.push({
        name: 'search',
        params: [paramName(s0.element, 'query')],
        paramTypes: [paramTypeFor(s0.element)],
        paramSecret: [isSensitiveField(s0.element)],
        paramElements: [s0.element],
        steps: [s0, s1],
      })
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
      drafts.push({
        name: 'search',
        params: [paramName(s0.element, 'query')],
        paramTypes: [paramTypeFor(s0.element)],
        paramSecret: [isSensitiveField(s0.element)],
        paramElements: [s0.element],
        steps: [s0, s1],
      })
      i += 2
      continue
    }

    // 3: 2× fill + click(submit-like) → login / register
    if (
      s0?.action === 'fill' &&
      s1?.action === 'fill' &&
      s2?.action === 'click' &&
      isSubmitLike(s2.element)
    ) {
      const looksLikeLogin = isPasswordField(s1.element)
      const looksLikeRegister = isRegistrationContext([s0.element, s1.element, s2.element])
      const name = looksLikeRegister ? 'register' : looksLikeLogin ? 'login' : 'submitForm'
      drafts.push({
        name,
        params: [paramName(s0.element, 'email'), paramName(s1.element, 'password')],
        paramTypes: [paramTypeFor(s0.element), paramTypeFor(s1.element)],
        paramSecret: [isSensitiveField(s0.element), isSensitiveField(s1.element)],
        paramElements: [s0.element, s1.element],
        steps: [s0, s1, s2],
      })
      i += 3
      continue
    }

    // 4 / 5: N× fill (+ optional submit click)
    if (s0?.action === 'fill') {
      const fillSteps: IRStep[] = []
      let j = i
      while (j < userSteps.length && userSteps[j]?.action === 'fill') {
        fillSteps.push(userSteps[j]!)
        j++
      }
      const next = userSteps[j]
      if (fillSteps.length >= 1 && next?.action === 'click') {
        drafts.push({
          name: 'submitForm',
          params: fillSteps.map((s, idx) => paramName(s.element, `field${idx + 1}`)),
          paramTypes: fillSteps.map((s) => paramTypeFor(s.element)),
          paramSecret: fillSteps.map((s) => isSensitiveField(s.element)),
          paramElements: fillSteps.map((s) => s.element),
          steps: [...fillSteps, next],
        })
        i = j + 1
        continue
      }
      if (fillSteps.length >= 2) {
        drafts.push({
          name: 'fillForm',
          params: fillSteps.map((s, idx) => paramName(s.element, `field${idx + 1}`)),
          paramTypes: fillSteps.map((s) => paramTypeFor(s.element)),
          paramSecret: fillSteps.map((s) => isSensitiveField(s.element)),
          paramElements: fillSteps.map((s) => s.element),
          steps: fillSteps,
        })
        i = j
        continue
      }
      // single trailing fill — fall through to default naming
    }

    // 6: checkbox + click(submit) → acceptAndSubmit
    if (
      s0?.action === 'click' &&
      isCheckboxLike(s0.element) &&
      s1?.action === 'click' &&
      isSubmitLike(s1.element)
    ) {
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
        const lastIdx = indexOf.get(d.steps[d.steps.length - 1]!) ?? -1
        if (lastIdx <= netIdx) owner = d
      }
      if (!owner) {
        owner = drafts[0]
      }
      if (owner) owner.steps.push(net)
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
