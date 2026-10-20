import type { IRScenario } from '../ir/types'
import { isSensitiveField } from '../planner/sensitive-detector'
import { indentBlock } from '../shared/indent'
import { assertNoSecretValues } from '../shared/secret-guard'
import { mapScenarioToGherkin, type GherkinFeature } from './gherkin-mapper'

/** Values the recording typed into fields classified as sensitive. */
function recordedSecrets(scenario: IRScenario): string[] {
  return scenario.pages
    .flatMap((page) => page.steps)
    .filter((step) => step.value && isSensitiveField(step.element))
    .map((step) => step.value!)
}

/**
 * Render the Gherkin `.feature` file; identical for every framework adapter. Secret values are never
 * written: the file holds `$ENV_VAR` references, and rendering fails if a recorded value slipped in.
 */
export function renderFeatureFile(scenario: IRScenario): string {
  const feature: GherkinFeature = mapScenarioToGherkin(scenario)
  const scenarioBlocks = feature.scenarios.map((sc) => {
    const stepLines = sc.steps.map((s) => `${s.keyword} ${s.text}`).join('\n')
    return `Scenario: ${sc.name}\n${indentBlock(stepLines, 2)}`
  })
  const text = `Feature: ${feature.name}\n\n${indentBlock(scenarioBlocks.join('\n\n'), 2)}\n`
  assertNoSecretValues(text, recordedSecrets(scenario), 'feature file')
  return text
}
