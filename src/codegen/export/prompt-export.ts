import { normalizeActions } from '../normalizer/action-normalizer'
import { groupIntoPages } from '../planner/page-grouper'
import { getEnvVarName } from '../planner/sensitive-detector'
import {
  PROMPT_ELEMENT_TEXT_PREVIEW_MAX,
  PROMPT_STRIPPED_HEADERS,
  SECRET_PARAM_DEFAULT_VALUE,
} from '@shared/constants'
import { xmlBlock, xmlText } from './prompt-xml'
import { getFrameworkConvention } from './prompt-conventions'
import {
  buildRedactionMap,
  buildRedactor,
  collectContractRows,
  slugifyFlow,
  type ContractRow,
  type PromptRedaction,
  type Redact,
} from './prompt-contract'
import type { JsonExportPayload } from './json-export'
import type { FrameworkId, PromptMode } from '@shared/types/generated'
import type { IRElement, IRPage, IRStep } from '../ir/types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type { PromptMode }

export interface PromptOptions {
  mode: PromptMode
  framework?: FrameworkId
  /** Override slug derived from session name; lower-cased + kebab-cased. */
  flowSlug?: string
  /**
   * When true (default), sensitive fill values are replaced with
   * `[REDACTED:RECOSPEC_*]` placeholders and `renderPromptMarkdown` enforces
   * the leak guard. When false, raw values are preserved and the guard is
   * bypassed — useful for local debugging only.
   */
  redactSecrets?: boolean
}

/** Data sections come first; `instructions` is always last (queries-at-end ordering). */
export type PromptSectionId =
  | 'role'
  | 'scenario'
  | 'pages'
  | 'flow'
  | 'network-mocks'
  | 'secrets'
  | 'fragility'
  | 'instructions'

export interface PromptSection {
  id: PromptSectionId
  /** Fully rendered XML element for this section. */
  xml: string
}

export type { PromptRedaction }

export interface PromptDocument {
  flowSlug: string
  mode: PromptMode
  framework?: FrameworkId
  redactSecrets: boolean
  frontmatter?: string
  sections: PromptSection[]
  redactionMap: PromptRedaction[]
  sessionId: string
  generatedAtIso: string
}

export class PromptRedactionError extends Error {
  constructor(public readonly leaks: string[]) {
    super(
      `Recospec prompt export blocked: detected ${leaks.length} secret-leak pattern(s): ` +
        leaks.map((l) => JSON.stringify(l)).join(', '),
    )
    this.name = 'PromptRedactionError'
  }
}

/**
 * Defense-in-depth guard. Scans the rendered prompt for `keyword[:=]value`
 * patterns that look like accidentally embedded secrets. Throws a
 * {@link PromptRedactionError} listing every match.
 */
export function assertNoLeakedSecrets(markdown: string): void {
  const re =
    /(password|secret|token|api[-_]?key|authorization|cookie)\s*[:=]\s*['"]?([^'"\s<]{4,})/gi
  const leaks: string[] = []
  for (const m of markdown.matchAll(re)) leaks.push(m[0])
  if (leaks.length > 0) throw new PromptRedactionError(leaks)
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const ROOT_TAG = 'recospec_prompt'

export function buildPromptDocument(
  payload: JsonExportPayload,
  opts: PromptOptions,
): PromptDocument {
  const redactSecrets = opts.redactSecrets ?? true
  const flowSlug = slugifyFlow(opts.flowSlug ?? payload.session.name)

  const { flatSteps } = normalizeActions(payload.actions)
  const pages = groupIntoPages(flatSteps, payload.session.startUrl)

  const rows = collectContractRows(pages)
  const redactionMap = redactSecrets ? buildRedactionMap(rows) : []
  const redact = buildRedactor(redactionMap)

  const sections: PromptSection[] = [
    { id: 'role', xml: buildRole() },
    { id: 'scenario', xml: buildScenario(payload, pages, flatSteps, redact) },
    { id: 'pages', xml: buildPages(pages, redact) },
    { id: 'flow', xml: buildFlow(pages, redact) },
    { id: 'network-mocks', xml: buildNetworkMocks(pages, redact) },
    { id: 'secrets', xml: buildSecrets(rows, redactSecrets) },
    { id: 'fragility', xml: buildFragility(pages) },
    { id: 'instructions', xml: buildInstructions(flowSlug, pages, rows, opts.framework) },
  ]

  const frontmatter = opts.mode === 'slash' ? buildFrontmatter(flowSlug, opts.framework) : undefined

  return {
    flowSlug,
    mode: opts.mode,
    framework: opts.framework,
    redactSecrets,
    frontmatter,
    sections,
    redactionMap,
    sessionId: payload.session.sessionId,
    generatedAtIso: new Date(payload.exportedAt).toISOString(),
  }
}

/** Renders the prompt document. Kept under its historical name for existing callers. */
export function renderPromptMarkdown(doc: PromptDocument): string {
  const root = xmlBlock(
    ROOT_TAG,
    {
      flow: doc.flowSlug,
      framework: doc.framework,
      session: doc.sessionId,
      generated_at: doc.generatedAtIso,
    },
    doc.sections.map((s) => s.xml),
  )

  let output: string
  if (doc.mode === 'slash') {
    output = `${doc.frontmatter}\n\n${root}\n`
  } else if (doc.mode === 'claude-md') {
    output =
      `<!-- BEGIN recospec:${doc.flowSlug} -->\n` +
      `${root}\n` +
      `<!-- END recospec:${doc.flowSlug} -->\n`
  } else {
    output = `${root}\n`
  }

  if (doc.redactSecrets) assertNoLeakedSecrets(output)
  return output
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFrontmatter(slug: string, framework: FrameworkId | undefined): string {
  const fwLine = framework ? `\nframework: ${framework}` : ''
  return [
    '---',
    `description: Recospec recorded flow — ${slug}`,
    'argument-hint: [flow-slug]',
    `allowed-tools: Read, Edit, Write, Bash${fwLine}`,
    '---',
  ].join('\n')
}

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed
}

// ---------------------------------------------------------------------------
// Data sections
// ---------------------------------------------------------------------------

function buildRole(): string {
  return xmlText(
    'role',
    {},
    "You are Recospec's recorded test author. The recording below is ground truth: write the " +
      'test code it describes and do not invent selectors, pages or flows.',
  )
}

function buildScenario(
  payload: JsonExportPayload,
  pages: IRPage[],
  flatSteps: IRStep[],
  redact: Redact,
): string {
  const { viewport, timezone } = payload.session.metadata
  return xmlBlock('scenario', {
    name: payload.session.name,
    start_url: redact(payload.session.startUrl),
    viewport: `${viewport.width}x${viewport.height}`,
    timezone,
    captured: new Date(payload.exportedAt).toISOString().slice(0, 10),
    pages: pages.length,
    steps: flatSteps.length,
    network_captures: flatSteps.filter((s) => s.action === 'network').length,
  })
}

function buildElement(el: IRElement, redact: Redact): string {
  const snapshot = el.elementSnapshot
  const children: string[] = [
    xmlText('locator', { strategy: el.locatorStrategy }, redact(el.locatorValue)),
  ]
  ;(el.fallbackLocators ?? []).forEach((fallback, idx) => {
    children.push(
      xmlText(
        'fallback',
        { rank: idx + 1, strategy: fallback.strategy },
        redact(fallback.locatorValue),
      ),
    )
  })
  if (el.shadowContext && el.shadowContext.hostChain.length > 0) {
    children.push(xmlText('shadow_host_chain', {}, el.shadowContext.hostChain.join(' >> ')))
  }
  if (el.frameContext && el.frameContext.frameChain.length > 0) {
    children.push(xmlText('frame_chain', {}, el.frameContext.frameChain.join(' >> ')))
  }
  return xmlBlock(
    'element',
    {
      name: el.name,
      tag: el.tagName,
      input_type: el.inputType,
      role: snapshot?.role,
      test_id: snapshot?.testId,
      text: snapshot?.textContent
        ? redact(truncate(snapshot.textContent, PROMPT_ELEMENT_TEXT_PREVIEW_MAX))
        : undefined,
    },
    children,
  )
}

function buildMethods(page: IRPage): string | undefined {
  const methods = page.inferredMethods ?? []
  if (methods.length === 0) return undefined
  return xmlBlock(
    'methods',
    {},
    methods.map((method) =>
      xmlBlock(
        'method',
        { name: method.name, steps: method.steps.length },
        method.params.map((param, idx) => {
          const sensitive = method.paramSecret?.[idx] ?? false
          return xmlBlock('param', {
            name: param,
            type: method.paramTypes?.[idx] ?? 'string',
            sensitive: sensitive ? true : undefined,
            env_var: sensitive ? getEnvVarName(param) : undefined,
          })
        }),
      ),
    ),
  )
}

function buildPages(pages: IRPage[], redact: Redact): string {
  if (pages.length === 0) return xmlBlock('pages', { empty: true })
  return xmlBlock(
    'pages',
    {},
    pages.map((page) => {
      const children = [
        xmlBlock(
          'elements',
          {},
          page.elements.map((el) => buildElement(el, redact)),
        ),
      ]
      const methods = buildMethods(page)
      if (methods) children.push(methods)
      return xmlBlock(
        'page',
        { class: page.className, url: redact(page.normalizedUrl), title: page.pageTitle },
        children,
      )
    }),
  )
}

function describeAssertion(step: IRStep): string {
  const name = step.element?.name ?? 'page'
  const detail = step.assertionDetail
  if (!detail) return `Asserts state of \`${name}\`.`
  switch (detail.type) {
    case 'visible':
      return `Verify \`${name}\` is visible.`
    case 'hidden':
      return `Verify \`${name}\` is hidden.`
    case 'text':
      return `Verify \`${name}\` has text ${JSON.stringify(String(detail.expected ?? ''))}.`
    case 'text-contains':
      return `Verify \`${name}\` text contains ${JSON.stringify(String(detail.expected ?? ''))}.`
    case 'not-empty':
      return `Verify \`${name}\` is not empty.`
    case 'matches':
      return `Verify \`${name}\` text matches /${String(detail.expected ?? '')}/.`
    case 'value':
      return `Verify \`${name}\` has value ${JSON.stringify(String(detail.expected ?? ''))}.`
    case 'attribute':
      return (
        `Verify \`${name}\` attribute \`${detail.attribute ?? ''}\` equals ` +
        `${JSON.stringify(String(detail.expected ?? ''))}.`
      )
    case 'count':
      return `Verify \`${name}\` resolves to ${detail.expected} elements.`
    case 'screenshot':
      return (
        `Capture visual baseline \`${detail.name ?? 'page'}\` ` +
        `(threshold ${detail.threshold ?? 0.2}).`
      )
  }
}

function buildFlow(pages: IRPage[], redact: Redact): string {
  const steps: string[] = []
  for (const page of pages) {
    for (const step of page.steps) {
      if (step.action === 'network') continue
      const attrs = {
        n: steps.length + 1,
        page: page.className,
        action: step.action,
        element: step.element?.name,
        value: step.value !== undefined ? redact(step.value) : undefined,
        url: step.url !== undefined ? redact(step.url) : undefined,
        key: step.key,
        reason: step.wait?.reason,
        timeout_ms: step.wait?.timeoutMs,
      }
      steps.push(
        step.action === 'assert'
          ? xmlText('step', attrs, redact(describeAssertion(step)))
          : xmlBlock('step', attrs),
      )
    }
  }
  if (steps.length === 0) return xmlBlock('flow', { empty: true })
  return xmlBlock('flow', {}, steps)
}

function buildNetworkMocks(pages: IRPage[], redact: Redact): string {
  const requests: string[] = []
  for (const page of pages) {
    for (const step of page.steps) {
      if (step.action !== 'network' || !step.network) continue
      const n = step.network
      requests.push(
        xmlText(
          'request',
          { page: page.className, method: n.method, status: n.status, content_type: n.contentType },
          redact(n.url),
        ),
      )
    }
  }
  if (requests.length === 0) return xmlBlock('network_mocks', { empty: true })
  return xmlBlock('network_mocks', { strip_headers: PROMPT_STRIPPED_HEADERS }, requests)
}

function buildSecrets(rows: ContractRow[], redactSecrets: boolean): string {
  const sensitive = rows.filter((r) => r.isSecret)
  if (sensitive.length === 0) return xmlBlock('secrets', { empty: true })
  const children = sensitive.map((row) => {
    const envVar = row.envVarName ?? ''
    const fallback = redactSecrets
      ? `[REDACTED:${envVar}]`
      : row.rawValue || SECRET_PARAM_DEFAULT_VALUE
    return xmlBlock('sensitive_param', {
      name: row.paramName,
      page: row.pageClass,
      method: row.methodName,
      env_var: envVar,
      default: fallback,
    })
  })
  if (!redactSecrets) {
    children.push(
      xmlText(
        'warning',
        {},
        'Redaction was disabled at export time. Treat this document as confidential and rotate any value that may have leaked.',
      ),
    )
  }
  return xmlBlock('secrets', {}, children)
}

function buildFragility(pages: IRPage[]): string {
  const hints: string[] = []
  for (const page of pages) {
    for (const el of page.elements) {
      const target = `${page.className}.${el.name}`
      if (el.locatorStrategy === 'css' || el.locatorStrategy === 'xpath') {
        hints.push(
          xmlText(
            'hint',
            { element: target, reason: `${el.locatorStrategy}-last-resort` },
            `Uses ${el.locatorStrategy}, a last-resort strategy. Prefer a listed fallback when one exists.`,
          ),
        )
      }
      if (el.shadowClosed) {
        hints.push(
          xmlText(
            'hint',
            { element: target, reason: 'closed-shadow-root' },
            'Lives inside a closed shadow root; the recorded locator may be unreliable across renders.',
          ),
        )
      }
      if (el.fragile) {
        hints.push(
          xmlText(
            'hint',
            { element: target, reason: 'positional-index' },
            'Relies on a positional index; verify it still resolves to the intended element.',
          ),
        )
      }
    }
  }
  if (hints.length === 0) return xmlBlock('fragility_hints', { empty: true })
  return xmlBlock('fragility_hints', {}, hints)
}

// ---------------------------------------------------------------------------
// Instructions (always last)
// ---------------------------------------------------------------------------

function buildInstructions(
  slug: string,
  pages: IRPage[],
  rows: ContractRow[],
  framework: FrameworkId | undefined,
): string {
  const convention = getFrameworkConvention(framework)
  const hasSecrets = rows.some((r) => r.isSecret)

  const deliverables = [
    ...pages.map((page) =>
      xmlBlock('file', {
        kind: 'page-object',
        page: page.className,
        path: convention.pageObjectPath(page.className),
      }),
    ),
    xmlBlock('file', { kind: 'scenario', path: convention.scenarioPath(slug) }),
  ]

  const rules = [
    'Use only the locators in the pages section. Try each locator first; if it fails, walk its fallback entries in rank order. Never invent selectors.',
    'Treat testid, aria-label, role-name and label locators as durable; css and xpath are last-resort. Check fragility_hints before relying on one.',
    'Expose each method as a page-object method with exactly the listed params and types, and replay the flow steps in order in the scenario.',
    'Implement every assert step in the flow as an assertion on the referenced element.',
    'A section marked empty="true" means the recording produced no data for it; do not fabricate any.',
    hasSecrets
      ? `Never inline a value from the secrets section. Read each one through its env_var using ${convention.envLookup} (X is the env_var name) so committed code never carries the value.`
      : 'No sensitive parameters were detected; still never hard-code credentials.',
    hasSecrets
      ? 'Redacted values map to the VALID test data. If the flow expects an error or rejection (an assert on an error message, an invalid state, or an unchanged page), build a deliberately invalid value from the env var (for example the env value plus a "-wrong" suffix); never reuse the valid value for a negative case and never inline a literal.'
      : undefined,
    `Only mock the requests in network_mocks that an assertion depends on, and strip the ${PROMPT_STRIPPED_HEADERS} headers from any fixture.`,
    'If the project already has page objects or tests for these pages, extend them with the missing methods instead of duplicating them.',
    'Do not hand-edit recorded locator values to make a test pass; report the failing element so the flow can be re-recorded.',
    ...convention.rules,
  ]

  return xmlBlock('instructions', {}, [
    xmlText(
      'task',
      {},
      `Write the test for the "${slug}" flow recorded above using ${convention.label}: one page ` +
        'object per page plus one scenario that replays the flow.',
    ),
    xmlBlock('deliverables', {}, deliverables),
    xmlBlock(
      'rules',
      {},
      rules
        .filter((rule): rule is string => rule !== undefined)
        .map((rule) => xmlText('rule', {}, rule)),
    ),
    xmlBlock('verification', {}, [
      xmlText('step', {}, `Run ${convention.runCommand} and fix failures until the test passes.`),
      xmlText(
        'step',
        {},
        'Confirm the generated files contain no literal secret values and no unused locators.',
      ),
    ]),
    xmlText(
      'output_format',
      {},
      'Create the files listed in deliverables, then reply with the files created or modified ' +
        'and the exact command you ran with its result. No other prose.',
    ),
  ])
}
