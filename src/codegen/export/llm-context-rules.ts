import { PROMPT_STRIPPED_HEADERS } from '@shared/constants'
import { getFrameworkConvention } from './prompt-conventions'
import type { FrameworkId, LlmContextTask } from '@shared/types/generated'
import type { LlmPage } from './llm-context-types'

const CODEGEN_RULES = [
  'Use only the listed locators; never invent selectors.',
  'One page object per P-id; one scenario that replays @steps in order.',
  'Each @methods entry becomes a page-object method with exactly those params.',
  'Implement every assert step as an assertion on its element.',
  'A missing section means the recording produced no data for it; do not fabricate any.',
]

const SECRET_RULES = [
  'A * marks a secret. Read it through its $ENV name; never inline a value.',
  'For a negative flow (error asserted), derive the invalid value from the env value plus "-wrong"; never reuse the valid one.',
]

const HEAL_RULES = [
  'When a locator fails, try its ~ fallbacks in rank order, then match @fp (role, label, near, path, a=) against the page.',
  'Return a replacement only when it resolves to a single element; otherwise report the element as unrecoverable.',
]

export function buildRules(
  task: LlmContextTask,
  framework: FrameworkId | undefined,
  hasSecrets: boolean,
  hasNetwork: boolean,
): string[] {
  const rules: string[] = []
  if (task !== 'heal') {
    rules.push(...CODEGEN_RULES)
    if (hasSecrets) rules.push(...SECRET_RULES)
    if (hasNetwork) {
      rules.push(
        `Mock only the @net calls an assertion depends on; strip ${PROMPT_STRIPPED_HEADERS} headers.`,
      )
    }
    rules.push(...getFrameworkConvention(framework).rules)
  }
  if (task !== 'codegen') rules.push(...HEAL_RULES)
  return rules
}

export function buildAsk(
  task: LlmContextTask,
  slug: string,
  pages: LlmPage[],
  framework: FrameworkId | undefined,
): string {
  const convention = getFrameworkConvention(framework)
  const parts: string[] = []
  if (task !== 'heal') {
    const files = [
      ...pages.map((p) => `${p.id}=${convention.pageObjectPath(p.className)}`),
      `scenario=${convention.scenarioPath(slug)}`,
    ].join(', ')
    parts.push(
      `Write ${convention.label} tests (${files}). Run ${convention.runCommand} until green.`,
    )
  }
  if (task !== 'codegen') {
    parts.push(
      'For a failing element id, answer {"el":"eN","loc":"strategy:value"} with the best replacement.',
    )
  }
  return parts.join(' ')
}
