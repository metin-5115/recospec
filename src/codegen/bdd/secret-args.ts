import type { GherkinStep } from './gherkin-mapper'

/**
 * Argument expressions of a step definition: a secret argument arrives as the `$ENV_VAR` text of
 * the feature, so it is passed through the adapter's resolver; everything else is used as is.
 */
export function resolveSecretArgs(
  step: GherkinStep,
  argNames: readonly string[],
  resolve: (argName: string) => string,
): string[] {
  return argNames.map((name, idx) => (step.secrets?.[idx] ? resolve(name) : name))
}
