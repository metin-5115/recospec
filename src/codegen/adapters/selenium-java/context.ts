import type { IRStep } from '../../ir/types'
import { javaStr } from './locator'

/**
 * Selenium has no locator syntax for "inside this iframe / shadow root":
 *
 *  - iframe: the driver is switched into the frame chain before the step and
 *    back to the top document before the next step that is outside it.
 *  - open shadow root: `renderByExpression` wraps the locator in a generated
 *    nested `ShadowBy` (a `By` that walks the host chain's shadow roots), so
 *    every By-based lookup works unchanged. Page-object fields are plain
 *    `@FindBy` WebElements that PageFactory resolves against the document, so
 *    they are re-assigned through `ShadowBy` right before the step.
 */

export interface JavaContextState {
  inFrame: boolean
}

export function newContextState(): JavaContextState {
  return { inFrame: false }
}

function framesOf(step: IRStep): string[] {
  return step.element?.frameContext?.frameChain ?? []
}

function usesFrames(steps: readonly IRStep[]): boolean {
  return steps.some((s) => framesOf(s).length > 0)
}

function usesShadow(steps: readonly IRStep[]): boolean {
  return steps.some((s) => (s.element?.shadowContext?.hostChain.length ?? 0) > 0)
}

/** Statements that must run before a step to put the driver in the right frame. */
export function frameStatements(step: IRStep, indent: string, state: JavaContextState): string[] {
  const frames = framesOf(step)
  if (frames.length > 0) {
    state.inFrame = true
    return [`${indent}enterFrames(${frames.map(javaStr).join(', ')});`]
  }
  if (state.inFrame) {
    state.inFrame = false
    return [`${indent}driver.switchTo().defaultContent();`]
  }
  return []
}

/** Import lines (each newline-terminated) the generated helpers need. */
export function javaContextImports(steps: readonly IRStep[]): string {
  if (!usesShadow(steps)) return ''
  return ['import java.util.List;', 'import org.openqa.selenium.SearchContext;']
    .map((line) => `${line}\n`)
    .join('')
}

const ENTER_FRAMES_METHOD = [
  '    private void enterFrames(String... selectors) {',
  '        driver.switchTo().defaultContent();',
  '        for (String selector : selectors) {',
  '            driver.switchTo().frame(',
  '                wait.until(ExpectedConditions.presenceOfElementLocated(By.cssSelector(selector))));',
  '        }',
  '    }',
].join('\n')

const SHADOW_BY_CLASS = [
  '    /** Locates an element inside the (open) shadow roots of a host chain. CSS locators only. */',
  '    private static final class ShadowBy extends By {',
  '        private final String[] hosts;',
  '        private final By inner;',
  '',
  '        private ShadowBy(String[] hosts, By inner) {',
  '            this.hosts = hosts;',
  '            this.inner = inner;',
  '        }',
  '',
  '        @Override',
  '        public List<WebElement> findElements(SearchContext context) {',
  '            SearchContext root = context;',
  '            for (String host : hosts) {',
  '                root = root.findElement(By.cssSelector(host)).getShadowRoot();',
  '            }',
  '            return root.findElements(inner);',
  '        }',
  '',
  '        @Override',
  '        public String toString() {',
  '            return "ShadowBy" + java.util.Arrays.toString(hosts) + " > " + inner;',
  '        }',
  '    }',
].join('\n')

/**
 * Helper members for a generated class body (4-space indented). `enterFrames`
 * relies on the class's `driver` and `wait` fields.
 */
export function renderContextHelpers(steps: readonly IRStep[]): string {
  const blocks: string[] = []
  if (usesFrames(steps)) blocks.push(ENTER_FRAMES_METHOD)
  if (usesShadow(steps)) blocks.push(SHADOW_BY_CLASS)
  return blocks.length ? '\n\n' + blocks.join('\n\n') : ''
}
