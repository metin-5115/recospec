import type { IRStep, IRElement, InferredMethod } from '../ir/types'

function paramName(element: IRElement | undefined, defaultName: string): string {
  if (!element) return defaultName
  const name = element.name.replace(/Input$|Button$|Link$|Select$/, '')
  const lower = name.charAt(0).toLowerCase() + name.slice(1)
  return lower || defaultName
}

function isSubmitLike(el: IRElement | undefined): boolean {
  if (!el) return false
  const n = el.name.toLowerCase()
  return (
    n.includes('submit') ||
    n.includes('login') ||
    n.includes('signin') ||
    n.includes('save') ||
    n.includes('confirm') ||
    n.includes('send') ||
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

/**
 * Infers semantic methods from a sequence of IRSteps.
 *
 * Patterns (in priority order):
 * 1. fill + keypress:Enter              → search(query)
 * 2. fill + fill + click(submit-like)   → login(email, password)
 * 3. fill(s) + click                    → submitForm(params...)
 * 4. click + navigate                   → openItem(name)
 * 5. click(menu-like) + click           → selectFromMenu(option)
 *
 * Unrecognised steps become doAction{N} raw methods.
 */
export function inferMethods(steps: IRStep[]): InferredMethod[] {
  const methods: InferredMethod[] = []
  let i = 0
  let rawIndex = 0

  while (i < steps.length) {
    const s0 = steps[i]
    const s1 = steps[i + 1]
    const s2 = steps[i + 2]

    // Skip lone navigate steps — they are not interactive user actions
    if (s0?.action === 'navigate') {
      i++
      continue
    }

    // Pattern 1: fill + keypress:Enter → search(query)
    if (s0?.action === 'fill' && s1?.action === 'keypress' && s1.key === 'Enter') {
      methods.push({
        name: 'search',
        params: [paramName(s0.element, 'query')],
        steps: [s0, s1],
      })
      i += 2
      continue
    }

    // Pattern 2: fill + fill + click(submit-like) → login(email, password)
    if (
      s0?.action === 'fill' &&
      s1?.action === 'fill' &&
      s2?.action === 'click' &&
      isSubmitLike(s2.element)
    ) {
      methods.push({
        name: 'login',
        params: [paramName(s0.element, 'email'), paramName(s1.element, 'password')],
        steps: [s0, s1, s2],
      })
      i += 3
      continue
    }

    // Pattern 3: one or more fills followed by a click → submitForm(...)
    if (s0?.action === 'fill') {
      const fillSteps: IRStep[] = []
      let j = i
      while (j < steps.length && steps[j]?.action === 'fill') {
        fillSteps.push(steps[j]!)
        j++
      }
      const clickStep = steps[j]
      if (fillSteps.length >= 1 && clickStep?.action === 'click') {
        methods.push({
          name: 'submitForm',
          params: fillSteps.map((s, idx) => paramName(s.element, `field${idx + 1}`)),
          steps: [...fillSteps, clickStep],
        })
        i = j + 1
        continue
      }
    }

    // Pattern 4: click + navigate → openItem(name)
    if (s0?.action === 'click' && s1?.action === 'navigate') {
      methods.push({
        name: 'openItem',
        params: [paramName(s0.element, 'itemName')],
        steps: [s0, s1],
      })
      i += 2
      continue
    }

    // Pattern 5: click(menu-like) + click → selectFromMenu(option)
    if (s0?.action === 'click' && s1?.action === 'click' && isMenuLike(s0.element)) {
      methods.push({
        name: 'selectFromMenu',
        params: [paramName(s1.element, 'option')],
        steps: [s0, s1],
      })
      i += 2
      continue
    }

    // Fallback: raw single-step method
    rawIndex++
    methods.push({
      name: `doAction${rawIndex}`,
      params: [],
      steps: [s0],
    })
    i++
  }

  return methods
}
