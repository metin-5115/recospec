export type LocatorStrategyName =
  | 'testid'
  | 'test-attr'
  | 'aria-label'
  | 'aria-labelledby'
  | 'role-name'
  | 'label'
  | 'text'
  | 'id'
  | 'css'
  | 'xpath'

export interface LocatorFrameworkOutput {
  playwright?: string
  cypress?: string
  seleniumPy?: string
}

export interface Locator {
  strategy: LocatorStrategyName
  selector: string | Record<string, string>
  framework: LocatorFrameworkOutput
}

export interface ScoredLocator extends Locator {
  score: number
}

export interface LocatorBundle {
  primary: ScoredLocator
  fallbacks: ScoredLocator[]
  rejected: ScoredLocator[]
}
