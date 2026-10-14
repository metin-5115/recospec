import type { IRScenario } from '../ir/types'
import { indentBlock } from '../shared/indent'
import { mapScenarioToGherkin, type GherkinFeature } from './gherkin-mapper'

/** Render the Gherkin `.feature` file; identical for every framework adapter. */
export function renderFeatureFile(scenario: IRScenario): string {
  const feature: GherkinFeature = mapScenarioToGherkin(scenario)
  const scenarioBlocks = feature.scenarios.map((sc) => {
    const stepLines = sc.steps.map((s) => `${s.keyword} ${s.text}`).join('\n')
    return `Scenario: ${sc.name}\n${indentBlock(stepLines, 2)}`
  })
  return `Feature: ${feature.name}\n\n${indentBlock(scenarioBlocks.join('\n\n'), 2)}\n`
}
