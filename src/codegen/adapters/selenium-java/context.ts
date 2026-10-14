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

function usesScreenshot(steps: readonly IRStep[]): boolean {
  return steps.some((s) => s.assertionDetail?.type === 'screenshot')
}

/** Allowed ratio of differing pixels when the recording carried no threshold. */
export const DEFAULT_SCREENSHOT_THRESHOLD = 0.02

/** File-name-safe form of the recorded snapshot name. */
export function screenshotName(name: string | undefined): string {
  return (name ?? 'snapshot').replace(/[^A-Za-z0-9_-]/g, '_')
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
  const lines: string[] = []
  if (usesShadow(steps)) {
    lines.push('import java.util.List;', 'import org.openqa.selenium.SearchContext;')
  }
  if (usesScreenshot(steps)) {
    lines.push(
      'import org.openqa.selenium.OutputType;',
      'import org.openqa.selenium.TakesScreenshot;',
    )
  }
  return lines.map((line) => `${line}\n`).join('')
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

const ASSERT_SCREENSHOT_METHOD = [
  '    /** Compares the page with screenshots/<name>.png; the first run records the baseline. */',
  '    private static void assertScreenshot(WebDriver driver, String name, double threshold) {',
  '        try {',
  '            byte[] png = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);',
  '            java.awt.image.BufferedImage current =',
  '                javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(png));',
  '            java.nio.file.Path baseline = java.nio.file.Paths.get("screenshots", name + ".png");',
  '            if (!java.nio.file.Files.exists(baseline)) {',
  '                java.nio.file.Files.createDirectories(baseline.getParent());',
  '                javax.imageio.ImageIO.write(current, "png", baseline.toFile());',
  '                return;',
  '            }',
  '            java.awt.image.BufferedImage expected = javax.imageio.ImageIO.read(baseline.toFile());',
  '            if (expected.getWidth() != current.getWidth()',
  '                    || expected.getHeight() != current.getHeight()) {',
  '                throw new AssertionError("screenshot " + name + ": size differs from the baseline");',
  '            }',
  '            long changed = 0;',
  '            for (int y = 0; y < current.getHeight(); y++) {',
  '                for (int x = 0; x < current.getWidth(); x++) {',
  '                    if (expected.getRGB(x, y) != current.getRGB(x, y)) {',
  '                        changed++;',
  '                    }',
  '                }',
  '            }',
  '            double ratio = (double) changed / ((long) current.getWidth() * current.getHeight());',
  '            if (ratio > threshold) {',
  '                throw new AssertionError(String.format(',
  '                    "screenshot %s: %.2f%% of pixels differ (allowed %.2f%%)",',
  '                    name, ratio * 100, threshold * 100));',
  '            }',
  '        } catch (java.io.IOException e) {',
  '            throw new java.io.UncheckedIOException(e);',
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
  if (usesScreenshot(steps)) blocks.push(ASSERT_SCREENSHOT_METHOD)
  return blocks.length ? '\n\n' + blocks.join('\n\n') : ''
}
