import type { IRStep } from '../../ir/types'

/**
 * Selenium has no matcher for visual regression, so the generated file carries
 * a small baseline comparison built on Pillow: the first run records
 * `screenshots/<name>.png`, later runs fail when more than `threshold`
 * (a 0..1 ratio) of the pixels differ.
 */

/** Allowed ratio of differing pixels when the recording carried no threshold. */
export const DEFAULT_SCREENSHOT_THRESHOLD = 0.02

export function usesScreenshot(steps: readonly IRStep[]): boolean {
  return steps.some((s) => s.assertionDetail?.type === 'screenshot')
}

/** File-name-safe form of the recorded snapshot name. */
export function screenshotName(name: string | undefined): string {
  return (name ?? 'snapshot').replace(/[^A-Za-z0-9_-]/g, '_')
}

/** Stdlib import lines the helper needs (without trailing newline). */
export function screenshotStdlibImports(steps: readonly IRStep[]): string[] {
  return usesScreenshot(steps) ? ['import io', 'import pathlib'] : []
}

/** Third-party import lines (each newline-terminated), or ''. */
export function screenshotThirdPartyImports(steps: readonly IRStep[]): string {
  return usesScreenshot(steps) ? 'from PIL import Image, ImageChops\n' : ''
}

const HELPER = [
  'def _assert_screenshot(driver, name, threshold):',
  '    """Compare the page with screenshots/<name>.png; the first run records the baseline."""',
  "    baseline = pathlib.Path('screenshots') / f'{name}.png'",
  '    current = Image.open(io.BytesIO(driver.get_screenshot_as_png())).convert("RGB")',
  '    if not baseline.exists():',
  '        baseline.parent.mkdir(parents=True, exist_ok=True)',
  '        current.save(baseline)',
  '        return',
  '    expected = Image.open(baseline).convert("RGB")',
  "    assert expected.size == current.size, f'screenshot {name}: size {current.size} != baseline {expected.size}'",
  '    diff = ImageChops.difference(expected, current)',
  '    if diff.getbbox() is None:',
  '        return',
  '    changed = diff.convert("L").point(lambda v: 255 if v else 0).histogram()[255]',
  '    ratio = changed / (current.width * current.height)',
  "    assert ratio <= threshold, f'screenshot {name}: {ratio:.2%} of pixels differ (allowed {threshold:.2%})'",
].join('\n')

/** The helper function source (no surrounding blank lines), or ''. */
export function renderScreenshotHelper(steps: readonly IRStep[]): string {
  return usesScreenshot(steps) ? HELPER : ''
}
