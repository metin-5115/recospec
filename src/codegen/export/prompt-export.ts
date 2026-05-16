import { normalizeActions } from '../normalizer/action-normalizer'
import { groupIntoPages } from '../planner/page-grouper'
import { getEnvVarName } from '../planner/sensitive-detector'
import type { JsonExportPayload } from './json-export'
import type { FrameworkId } from '@shared/types/generated'
import type { IRPage, IRStep, IRParamType } from '../ir/types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PromptMode = 'slash' | 'claude-md' | 'prompt'

export interface PromptOptions {
  mode: PromptMode
  framework?: FrameworkId
  /** Override slug derived from session name; lower-cased + kebab-cased. */
  flowSlug?: string
  /**
   * When true (default), sensitive fill values are replaced with
   * `<REDACTED:PLAYFORGE_*>` placeholders and `renderPromptMarkdown` enforces
   * the leak guard. When false, raw values are preserved and the guard is
   * bypassed — useful for local debugging only.
   */
  redactSecrets?: boolean
}

export type PromptSectionId =
  | 'mission'
  | 'summary'
  | 'pages'
  | 'locator-catalogue'
  | 'fragility'
  | 'verification'
  | 'mocks'
  | 'secrets'
  | 'self-healing'
  | 'footer'

export interface PromptSection {
  id: PromptSectionId
  /** Markdown H2 heading; when omitted the section body is rendered raw. */
  title?: string
  body: string
}

export interface PromptRedaction {
  rawValue: string
  placeholder: string
  envVarName: string
}

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
      `PlayForge prompt export blocked: detected ${leaks.length} secret-leak pattern(s): ` +
        leaks.map((l) => JSON.stringify(l)).join(', '),
    )
    this.name = 'PromptRedactionError'
  }
}

/**
 * Defense-in-depth guard. Scans rendered markdown for `keyword[:=]value`
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

export function buildPromptDocument(
  payload: JsonExportPayload,
  opts: PromptOptions,
): PromptDocument {
  const redactSecrets = opts.redactSecrets ?? true
  const flowSlug = slugifyFlow(opts.flowSlug ?? payload.session.name)

  const { flatSteps } = normalizeActions(payload.actions)
  const pages = groupIntoPages(flatSteps, payload.session.startUrl)

  const rows = collectContractRows(pages)
  const redactionMap: PromptRedaction[] = redactSecrets
    ? rows
        .filter((r) => r.isSecret && r.envVarName && r.rawValue && r.rawValue.length >= 4)
        .map((r) => ({
          rawValue: r.rawValue,
          envVarName: r.envVarName!,
          placeholder: `<REDACTED:${r.envVarName!}>`,
        }))
    : []

  const rawSections: PromptSection[] = [
    buildMissionSection(flowSlug, opts.framework),
    buildSummarySection(payload, pages, flatSteps),
    buildPagesSection(pages),
    buildLocatorCatalogueSection(pages),
    buildFragilitySection(pages),
    buildVerificationSection(pages),
    buildMocksSection(pages),
    buildSecretsSection(rows, redactSecrets),
    buildSelfHealingSection(),
    buildFooterSection(payload.session.sessionId, payload.exportedAt),
  ]

  const sections = redactSecrets ? applyRedaction(rawSections, redactionMap) : rawSections
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

export function renderPromptMarkdown(doc: PromptDocument): string {
  const body = doc.sections.map(renderSection).join('\n\n')

  let markdown: string
  if (doc.mode === 'slash') {
    markdown = `${doc.frontmatter}\n\n${body}\n`
  } else if (doc.mode === 'claude-md') {
    markdown =
      `<!-- BEGIN playforge:${doc.flowSlug} -->\n` +
      `${body}\n` +
      `<!-- END playforge:${doc.flowSlug} -->\n`
  } else {
    markdown = `${body}\n`
  }

  if (doc.redactSecrets) assertNoLeakedSecrets(markdown)
  return markdown
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugifyFlow(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'flow'
}

interface ContractRow {
  pageClass: string
  methodName: string
  paramName: string
  paramType: IRParamType
  isSecret: boolean
  envVarName?: string
  /** Captured raw fill value (empty for non-fill params like booleans). */
  rawValue: string
}

function collectContractRows(pages: IRPage[]): ContractRow[] {
  const rows: ContractRow[] = []
  for (const page of pages) {
    for (const method of page.inferredMethods ?? []) {
      const fillSteps = method.steps.filter((s) => s.action === 'fill')
      method.params.forEach((paramName, idx) => {
        const isSecret = method.paramSecret?.[idx] ?? false
        const paramType = method.paramTypes?.[idx] ?? 'string'
        const fill = fillSteps[idx]
        rows.push({
          pageClass: page.className,
          methodName: method.name,
          paramName,
          paramType,
          isSecret,
          envVarName: isSecret ? getEnvVarName(paramName) : undefined,
          rawValue: fill?.value ?? '',
        })
      })
    }
  }
  return rows
}

function applyRedaction(sections: PromptSection[], map: PromptRedaction[]): PromptSection[] {
  if (map.length === 0) return sections
  return sections.map((s) => ({
    ...s,
    body: map.reduce((acc, r) => acc.split(r.rawValue).join(r.placeholder), s.body),
  }))
}

function buildFrontmatter(slug: string, framework: FrameworkId | undefined): string {
  const fwLine = framework ? `\nframework: ${framework}` : ''
  return [
    '---',
    `description: PlayForge recorded flow — ${slug}`,
    'argument-hint: [flow-slug]',
    `allowed-tools: Read, Edit, Write, Bash${fwLine}`,
    '---',
  ].join('\n')
}

function buildMissionSection(slug: string, framework?: FrameworkId): PromptSection {
  const fw = framework ?? 'the project framework'
  const body =
    `You are PlayForge's recorded test author for the **${slug}** flow. ` +
    `Generate or update the ${fw} test using the locator catalogue below as ground truth. ` +
    'Never invent selectors — every interaction must reuse one of the locators listed in this ' +
    'document or fall back to one of its alternates. When you add an assertion, reuse the ' +
    'listed elements; when you mock a request, reuse the captured signatures.'
  return { id: 'mission', body }
}

function buildSummarySection(
  payload: JsonExportPayload,
  pages: IRPage[],
  flatSteps: IRStep[],
): PromptSection {
  const date = new Date(payload.exportedAt).toISOString().slice(0, 10)
  const { viewport, timezone } = payload.session.metadata
  const networkCount = flatSteps.filter((s) => s.action === 'network').length
  const body = [
    `- Captured: ${date}`,
    `- Start URL: ${payload.session.startUrl}`,
    `- Viewport: ${viewport.width}×${viewport.height}`,
    `- Timezone: ${timezone}`,
    `- Pages: ${pages.length}`,
    `- Steps: ${flatSteps.length}`,
    `- Network captures: ${networkCount}`,
  ].join('\n')
  return { id: 'summary', title: 'Scenario summary', body }
}

function buildPagesSection(pages: IRPage[]): PromptSection {
  if (pages.length === 0) {
    return { id: 'pages', title: 'Pages & inferred methods', body: '_No pages captured._' }
  }
  const lines = ['| Page | Method | Parameters | Steps |', '| ---- | ------ | ---------- | ----- |']
  for (const page of pages) {
    const methods = page.inferredMethods ?? []
    if (methods.length === 0) {
      lines.push(
        `| ${page.className} | _(no inferred methods)_ | _(none)_ | ${page.steps.length} |`,
      )
      continue
    }
    for (const method of methods) {
      const params = method.params.length
        ? method.params.map((p, i) => (method.paramSecret?.[i] ? `${p} 🔒` : p)).join(', ')
        : '_(none)_'
      lines.push(`| ${page.className} | ${method.name} | ${params} | ${method.steps.length} |`)
    }
  }
  return { id: 'pages', title: 'Pages & inferred methods', body: lines.join('\n') }
}

function buildLocatorCatalogueSection(pages: IRPage[]): PromptSection {
  if (pages.length === 0) {
    return {
      id: 'locator-catalogue',
      title: 'Locator catalogue',
      body: '_No locators captured._',
    }
  }
  const blocks: string[] = []
  for (const page of pages) {
    const elements = page.elements.map((el) => ({
      name: el.name,
      tag: el.tagName,
      inputType: el.inputType,
      primary: { strategy: el.locatorStrategy, value: el.locatorValue },
      fallbacks: (el.fallbackLocators ?? []).map((f) => ({
        strategy: f.strategy,
        value: f.locatorValue,
      })),
      snapshot: el.elementSnapshot,
      shadow: el.shadowContext ? { hostChain: el.shadowContext.hostChain } : undefined,
      frame: el.frameContext ? { chain: el.frameContext.frameChain } : undefined,
    }))
    blocks.push(`### ${page.className}\n\n\`\`\`json\n${JSON.stringify(elements, null, 2)}\n\`\`\``)
  }
  return { id: 'locator-catalogue', title: 'Locator catalogue', body: blocks.join('\n\n') }
}

function buildFragilitySection(pages: IRPage[]): PromptSection {
  const warnings: string[] = []
  for (const page of pages) {
    for (const el of page.elements) {
      if (el.locatorStrategy === 'css' || el.locatorStrategy === 'xpath') {
        warnings.push(
          `- **${page.className}.${el.name}** uses \`${el.locatorStrategy}\` — last-resort strategy. Prefer one of the listed fallbacks if available.`,
        )
      }
      if (el.shadowClosed) {
        warnings.push(
          `- **${page.className}.${el.name}** lives inside a closed shadow root — the recorded locator may be unreliable across renders.`,
        )
      }
    }
  }
  const body = warnings.length
    ? warnings.join('\n')
    : '_No fragile locators detected — every element resolved to a semantic strategy (testid, aria, role, label, text, or id)._'
  return { id: 'fragility', title: 'Fragility hints', body }
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

function buildVerificationSection(pages: IRPage[]): PromptSection {
  const lines: string[] = []
  for (const page of pages) {
    for (const step of page.steps) {
      if (step.action === 'assert') {
        lines.push(`- (${page.className}) ${describeAssertion(step)}`)
      }
    }
  }
  const body = lines.length
    ? lines.join('\n')
    : '_No assertions captured. Add an explicit visibility / text check after the primary action when generating the test._'
  return { id: 'verification', title: 'Verification expectations', body }
}

function buildMocksSection(pages: IRPage[]): PromptSection {
  const captures: { pageClass: string; step: IRStep }[] = []
  for (const page of pages) {
    for (const step of page.steps) {
      if (step.action === 'network' && step.network) {
        captures.push({ pageClass: page.className, step })
      }
    }
  }
  if (captures.length === 0) {
    return {
      id: 'mocks',
      title: 'Mock guidance',
      body: '_No network captures. Skip the mock checkbox unless your test needs to deterministically replay an API response._',
    }
  }
  const lines = [
    'Before shipping fixtures from the requests below, **strip** the `Authorization`, ' +
      '`Cookie`, and `Set-Cookie` headers — they leak credentials. Replay only the response ' +
      'shape your assertion depends on.',
    '',
    '| Page | Method | URL | Status | Content-Type |',
    '| ---- | ------ | --- | ------ | ------------ |',
  ]
  for (const { pageClass, step } of captures) {
    const n = step.network!
    lines.push(
      `| ${pageClass} | ${n.method} | ${n.url} | ${n.status ?? '—'} | ${n.contentType ?? '—'} |`,
    )
  }
  return { id: 'mocks', title: 'Mock guidance', body: lines.join('\n') }
}

function buildSecretsSection(rows: ContractRow[], redactSecrets: boolean): PromptSection {
  const sensitive = rows.filter((r) => r.isSecret)
  if (sensitive.length === 0) {
    return {
      id: 'secrets',
      title: 'Sensitive values contract',
      body: '_No sensitive parameters detected in this flow._',
    }
  }
  const lines = ['| Parameter | Env var | Default |', '| --------- | ------- | ------- |']
  for (const row of sensitive) {
    const envVar = row.envVarName ?? ''
    const def = redactSecrets ? `\`<REDACTED:${envVar}>\`` : `\`${row.rawValue || 'change-me'}\``
    lines.push(`| \`${row.paramName}\` 🔒 | \`${envVar}\` | ${def} |`)
  }
  lines.push('')
  lines.push(
    redactSecrets
      ? 'Never inline these defaults into the generated test — adapters must emit env-var lookups (`process.env.X ?? "change-me"` or equivalent) so committed code never carries the secret.'
      : '⚠️ Redaction was disabled at export time. Treat this document as confidential and rotate any value that may have leaked.',
  )
  return { id: 'secrets', title: 'Sensitive values contract', body: lines.join('\n') }
}

function buildSelfHealingSection(): PromptSection {
  const body =
    'Each element in the locator catalogue ships with a `primary` selector plus an ordered ' +
    '`fallbacks` array. When the primary breaks (DOM refactor, framework upgrade, A/B test), ' +
    'walk the fallbacks **in order** before regenerating — the engine ranked them by stability. ' +
    'Treat `testid`, `aria-label`, `role-name`, and `label` as durable; `css` and `xpath` are ' +
    'last-resort. Never hand-edit the locator catalogue inline — request a fresh recording so ' +
    'PlayForge can re-score against the new DOM.'
  return { id: 'self-healing', title: 'Self-healing instructions', body }
}

function buildFooterSection(sessionId: string, generatedAt: number): PromptSection {
  const iso = new Date(generatedAt).toISOString()
  return {
    id: 'footer',
    body: `<!-- Generated by PlayForge — session ${sessionId} at ${iso} -->`,
  }
}

function renderSection(section: PromptSection): string {
  if (!section.title) return section.body
  return `## ${section.title}\n\n${section.body}`
}
