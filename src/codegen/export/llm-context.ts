import { normalizeActions, rawSelector } from '../normalizer/action-normalizer'
import { groupIntoPages } from '../planner/page-grouper'
import { isSensitiveField } from '../planner/sensitive-detector'
import {
  DYNAMIC_VALUE_MASK,
  LLM_CONTEXT_DOM_PATH_SEGMENTS,
  LLM_CONTEXT_MAX_FALLBACKS,
  LLM_CONTEXT_MAX_NEIGHBORS,
  LLM_CONTEXT_MAX_REQUESTS,
  LLM_CONTEXT_NEIGHBOR_TEXT_MAX,
  LLM_CONTEXT_TEXT_MAX,
} from '@shared/constants'
import {
  buildRedactionMap,
  buildRedactor,
  collectContractRows,
  slugifyFlow,
  type Redact,
} from './prompt-contract'
import { buildAsk, buildRules } from './llm-context-rules'
import {
  isFragileLocator,
  isStateAttribute,
  isUsableFallback,
  semanticDomPath,
} from './llm-context-noise'
import { LLM_CONTEXT_VERSION } from './llm-context-types'
import type {
  LlmContext,
  LlmElement,
  LlmFingerprint,
  LlmLocator,
  LlmMethod,
  LlmPage,
  LlmRequest,
  LlmStep,
} from './llm-context-types'
import type { JsonExportPayload } from './json-export'
import type { ElementFingerprint } from '@shared/types/locator'
import type { FrameworkId, LlmContextTask } from '@shared/types/generated'
import { isRecordableNetworkCall } from '@shared/network-filter'
import type { IRElement, IRFallback, IRNetworkInfo, IRPage, IRStep } from '../ir/types'

export { LLM_CONTEXT_VERSION }

export interface LlmContextOptions {
  task: LlmContextTask
  framework?: FrameworkId
  /** Override the slug derived from the session name. */
  flowSlug?: string
  /** Default true: secret fill values become `$RECOSPEC_*` references. */
  redactSecrets?: boolean
  /** Default true: include rules and the task line. */
  includeInstructions?: boolean
}

const STRATEGY_ABBREVIATIONS: Record<string, string> = {
  testid: 'tid',
  'test-attr': 'attr',
  'aria-label': 'aria',
  'aria-labelledby': 'aria-by',
  'role-name': 'role',
  composed: 'cmp',
  template: 'tpl',
  layout: 'lay',
  placeholder: 'ph',
}

/** Volatile or noisy attributes that never help identify an element. */
const FINGERPRINT_SKIPPED_ATTRS: ReadonlySet<string> = new Set(['class', 'style', 'value'])
const FINGERPRINT_MAX_ATTRS = 5
const FINGERPRINT_ATTR_VALUE_MAX = 40
const BOX_PRECISION = 2

/** Controls whose text content is option text or typed input, not a name. */
const FORM_CONTROL_TAGS: ReadonlySet<string> = new Set(['select', 'textarea', 'input'])

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed
}

/** Role-name selectors arrive as a JSON object; `button:Sign in` says the same in fewer tokens. */
function compactLocatorValue(strategy: string, value: string): string {
  if (strategy !== 'role-name' || !value.startsWith('{')) return value
  try {
    const parsed = JSON.parse(value) as { role?: unknown; name?: unknown }
    if (typeof parsed.role !== 'string') return value
    return typeof parsed.name === 'string' ? `${parsed.role}:${parsed.name}` : parsed.role
  } catch {
    return value
  }
}

function toLocator(strategy: string, value: string, redact: Redact): LlmLocator {
  return {
    strategy: STRATEGY_ABBREVIATIONS[strategy] ?? strategy,
    value: redact(compactLocatorValue(strategy, value)),
  }
}

function toFallbacks(
  fallbacks: IRFallback[] | undefined,
  primary: LlmLocator,
  redact: Redact,
): LlmLocator[] {
  const primaryText = `${primary.strategy}:${primary.value}`
  return (fallbacks ?? [])
    .map((f) => toLocator(f.strategy, f.locatorValue, redact))
    .filter((f) => isUsableFallback(f, primaryText))
    .slice(0, LLM_CONTEXT_MAX_FALLBACKS)
}

/** Strategies whose value is a selector expression and can embed generated classes. */
const SELECTOR_STRATEGIES: ReadonlySet<string> = new Set(['css', 'xpath', 'composed', 'layout'])

/** An attribute value this short would match almost any locator by accident. */
const MIN_REDUNDANT_ATTR_LENGTH = 4

/**
 * @param stated everything the element's line already says (shortened label, full label and every
 *   locator value); an attribute whose value is contained in one of them adds nothing.
 */
function toFingerprint(
  fp: ElementFingerprint,
  label: string | undefined,
  stated: string[],
  redact: Redact,
): LlmFingerprint | undefined {
  const path = semanticDomPath(fp.domPath, LLM_CONTEXT_DOM_PATH_SEGMENTS)
  const neighbors = [
    ...new Set(
      fp.neighborTexts
        .filter((t) => !t.includes(DYNAMIC_VALUE_MASK))
        .map((t) => truncate(t, LLM_CONTEXT_NEIGHBOR_TEXT_MAX))
        .filter((t) => t.length > 0 && t !== label),
    ),
  ]
    .slice(0, LLM_CONTEXT_MAX_NEIGHBORS)
    .map(redact)
  const { x, y } = fp.boundingBoxRatio
  const hasBox = x !== 0 || y !== 0
  const attrs = Object.entries(fp.attributes)
    .filter(
      ([key, value]) =>
        !FINGERPRINT_SKIPPED_ATTRS.has(key) &&
        !isStateAttribute(key) &&
        !value.includes(DYNAMIC_VALUE_MASK) &&
        value !== label &&
        !(value.length >= MIN_REDUNDANT_ATTR_LENGTH && stated.some((text) => text.includes(value))),
    )
    .slice(0, FINGERPRINT_MAX_ATTRS)
    .map(([key, value]) => `${key}:${redact(truncate(value, FINGERPRINT_ATTR_VALUE_MAX))}`)
  const box = hasBox
    ? `${x.toFixed(BOX_PRECISION)},${y.toFixed(BOX_PRECISION)}`.replace(/(^|,)0\./g, '$1.')
    : undefined
  if (!path && neighbors.length === 0 && !box && attrs.length === 0) return undefined
  return { path, neighbors, box, attrs }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

/** Path relative to the shared origin, without query or fragment. */
function relativePath(url: string, base: string): string {
  try {
    const parsed = new URL(url)
    // `;`-separated matrix parameters (ad-tech URLs) carry tracking ids, not routes.
    const pathname = parsed.pathname.split(';')[0] ?? ''
    return parsed.origin === base ? pathname : `${parsed.origin}${pathname}`
  } catch {
    return url
  }
}

function abbreviateContentType(contentType: string | undefined): string | undefined {
  if (!contentType) return undefined
  if (contentType.includes('json')) return 'json'
  if (contentType.includes('html')) return 'html'
  if (contentType.startsWith('text/')) return 'text'
  return contentType.split(';')[0]
}

/** Same-origin calls with a real status; third-party beacons and opaque (status 0) calls are noise. */
function isListableRequest(network: IRNetworkInfo, base: string): boolean {
  return isRecordableNetworkCall(network, base)
}

/** Distinct listable requests in first-seen order; repeats are folded into `count`. */
function collectRequests(pages: IRPage[], base: string, redact: Redact): LlmRequest[] {
  const byKey = new Map<string, LlmRequest>()
  for (const page of pages) {
    for (const step of page.steps) {
      const network = step.action === 'network' ? step.network : undefined
      if (!network || !isListableRequest(network, base)) continue
      const request: LlmRequest = {
        method: network.method,
        path: redact(relativePath(network.url, base)),
        status: network.status,
        type: abbreviateContentType(network.contentType),
        count: 1,
      }
      const key = `${request.method} ${request.path} ${request.status} ${request.type}`
      const existing = byKey.get(key)
      if (existing) existing.count++
      else byKey.set(key, request)
    }
  }
  return [...byKey.values()].slice(0, LLM_CONTEXT_MAX_REQUESTS)
}

function formatValue(value: string): string {
  return /^\$[A-Z0-9_]+$/.test(value) ? value : JSON.stringify(value)
}

function describeAssertion(step: IRStep): string {
  const d = step.assertionDetail
  if (!d) return 'state'
  switch (d.type) {
    case 'visible':
    case 'hidden':
    case 'not-empty':
      return d.type
    case 'attribute':
      return `attr ${d.attribute ?? ''} ${JSON.stringify(String(d.expected ?? ''))}`
    case 'screenshot':
      return `shot ${d.name ?? 'page'} ${d.threshold ?? ''}`.trim()
    default:
      return `${d.type} ${JSON.stringify(String(d.expected ?? ''))}`
  }
}

function describeStep(step: IRStep, base: string, redact: Redact): string | undefined {
  switch (step.action) {
    case 'navigate':
      return step.url !== undefined ? redact(relativePath(step.url, base)) : undefined
    case 'fill':
    case 'select':
      return step.value !== undefined ? formatValue(redact(step.value)) : undefined
    case 'upload':
      return step.upload ? formatValue(redact(step.upload.fileNames.join(', '))) : undefined
    case 'keypress':
      return step.key
    case 'wait':
      return step.wait ? `${step.wait.reason} ${step.wait.timeoutMs}` : undefined
    case 'assert':
      return describeAssertion(step)
    default:
      return undefined
  }
}

/** `[1,2,3,5]` stays as numbers; renderers decide how to compress them. */
function stepNumbers(steps: IRStep[], numbers: Map<string, number>): number[] {
  return steps.flatMap((s) => {
    const n = numbers.get(s.id)
    return n === undefined ? [] : [n]
  })
}

export function buildLlmContext(payload: JsonExportPayload, opts: LlmContextOptions): LlmContext {
  const redactSecrets = opts.redactSecrets ?? true
  const includeInstructions = opts.includeInstructions ?? true
  const includeHealing = opts.task !== 'codegen'
  const flow = slugifyFlow(opts.flowSlug ?? payload.session.name)
  const base = originOf(payload.session.startUrl)

  const { flatSteps } = normalizeActions(payload.actions)
  const irPages = groupIntoPages(flatSteps, payload.session.startUrl)
  const rows = collectContractRows(irPages)

  const redactionMap = redactSecrets
    ? buildRedactionMap(rows).map((r) => ({ ...r, placeholder: `$${r.envVarName}` }))
    : []
  const redact = buildRedactor(redactionMap)

  const fingerprints = new Map<string, ElementFingerprint>()
  for (const action of payload.actions) {
    const fp = action.target?.fingerprint
    if (fp && action.target) {
      const key = rawSelector(action.target.primaryLocator)
      if (!fingerprints.has(key)) fingerprints.set(key, fp)
    }
  }

  const pages: LlmPage[] = irPages.map((page, idx) => ({
    id: `P${idx + 1}`,
    className: page.className,
    path: redact(page.normalizedUrl),
    title: page.pageTitle,
  }))
  const pageIdByClass = new Map(pages.map((p) => [p.className, p.id]))

  const elements: LlmElement[] = []
  const elementIds = new Map<string, string>()
  const ensureElement = (page: IRPage, el: IRElement): string => {
    const key = `${page.className}|${el.name}`
    const existing = elementIds.get(key)
    if (existing) return existing
    const id = `e${elements.length + 1}`
    elementIds.set(key, id)
    const fp = fingerprints.get(el.locatorValue)
    const rawLabel =
      fp?.accessibleName ??
      (FORM_CONTROL_TAGS.has(el.tagName) ? undefined : el.elementSnapshot?.textContent)
    const label = rawLabel ? redact(truncate(rawLabel, LLM_CONTEXT_TEXT_MAX)) : undefined
    const locator = toLocator(el.locatorStrategy, el.locatorValue, redact)
    const fallbacks = includeHealing ? toFallbacks(el.fallbackLocators, locator, redact) : []
    const stated = [rawLabel ?? '', locator.value, ...fallbacks.map((f) => f.value)]
    elements.push({
      id,
      page: pageIdByClass.get(page.className) ?? '',
      name: el.name,
      tag: el.tagName,
      inputType: el.inputType,
      role: el.elementSnapshot?.role ?? fp?.role ?? undefined,
      label: label || undefined,
      locator,
      fallbacks,
      isSecret: isSensitiveField(el),
      isFragile:
        el.fragile === true ||
        (SELECTOR_STRATEGIES.has(el.locatorStrategy) && isFragileLocator(el.locatorValue)),
      fingerprint: includeHealing && fp ? toFingerprint(fp, label, stated, redact) : undefined,
    })
    return id
  }
  for (const page of irPages) for (const el of page.elements) ensureElement(page, el)

  const steps: LlmStep[] = []
  const numbers = new Map<string, number>()
  for (const page of irPages) {
    for (const step of page.steps) {
      if (step.action === 'network') continue
      const n = steps.length + 1
      numbers.set(step.id, n)
      steps.push({
        n,
        action:
          step.action === 'navigate' ? 'nav' : step.action === 'keypress' ? 'key' : step.action,
        el: step.element ? ensureElement(page, step.element) : undefined,
        value: describeStep(step, base, redact),
      })
    }
  }

  const methods: LlmMethod[] = irPages.flatMap((page) =>
    (page.inferredMethods ?? []).map((method) => ({
      page: pageIdByClass.get(page.className) ?? '',
      name: method.name,
      params: method.params.map((name, idx) => ({
        name,
        type: method.paramTypes?.[idx] ?? 'string',
        isSecret: method.paramSecret?.[idx] ?? false,
      })),
      steps: stepNumbers(method.steps, numbers),
    })),
  )

  // Mocks only matter when an assertion depends on a response, and healing never mocks.
  const hasAssertion = flatSteps.some((s) => s.action === 'assert')
  const requests =
    opts.task !== 'heal' && hasAssertion ? collectRequests(irPages, base, redact) : []

  const rules = includeInstructions
    ? buildRules(
        opts.task,
        opts.framework,
        rows.some((r) => r.isSecret),
        requests.length > 0,
      )
    : []

  return {
    flow,
    framework: opts.framework,
    task: opts.task,
    base,
    pages,
    elements,
    steps,
    methods,
    requests,
    rules,
    ask: includeInstructions ? buildAsk(opts.task, flow, pages, opts.framework) : undefined,
    redactSecrets,
  }
}
