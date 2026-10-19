import {
  JAVA_MAIN_ROOT,
  JAVA_TEST_ROOT,
  javaPackage,
  resolveOutputDirs,
  type OutputDirOverrides,
} from '../../export/output-layout'

/** Java packages of the page-object and test folders (`src/main/java/pages` → `pages`). */
export function javaPackages(overrides?: OutputDirOverrides): { pages: string; tests: string } {
  const dirs = resolveOutputDirs('selenium-java', overrides)
  return {
    pages: javaPackage(dirs.pages, JAVA_MAIN_ROOT),
    tests: javaPackage(dirs.tests, JAVA_TEST_ROOT),
  }
}
