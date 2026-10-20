import {
  JAVA_TEST_DATA_HELPER_PATH,
  JAVA_TEST_DATA_PACKAGE,
  JAVA_TEST_DATA_PROPERTIES_PATH,
} from '@shared/constants'
import type { GeneratedFile } from '@shared/types/generated'
import { javaStr } from './locator'

const PROPERTIES_RESOURCE = JAVA_TEST_DATA_PROPERTIES_PATH.split('/').pop() as string

/** `TestData.get("RECOSPEC_PASSWORD", "change-me")` — the lookup a generated fill step makes. */
export function javaTestDataExpr(envVarName: string, defaultValue: string): string {
  return `TestData.get(${javaStr(envVarName)}, ${javaStr(defaultValue)})`
}

/** The import a source file needs, or nothing when it never calls the helper. */
export function javaTestDataImport(source: string): string {
  return source.includes('TestData.get(') ? `import ${JAVA_TEST_DATA_PACKAGE}.TestData;\n` : ''
}

/**
 * Reads a test-data value: a real environment variable wins, then `test-data.properties` on the
 * class path (`src/test/resources`), then the default baked into the test. An empty value counts as
 * unset, so the blank secrets in the `.example` file fall through to the default.
 */
const TEST_DATA_JAVA = `package ${JAVA_TEST_DATA_PACKAGE};

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

public final class TestData {
    private static final Properties FILE = load();

    private TestData() {}

    public static String get(String name, String fallback) {
        String fromEnv = System.getenv(name);
        if (fromEnv != null && !fromEnv.isEmpty()) {
            return fromEnv;
        }
        String fromFile = FILE.getProperty(name);
        if (fromFile != null && !fromFile.isEmpty()) {
            return fromFile;
        }
        return fallback;
    }

    private static Properties load() {
        Properties properties = new Properties();
        try (InputStream in = TestData.class.getClassLoader().getResourceAsStream(${javaStr(PROPERTIES_RESOURCE)})) {
            if (in != null) {
                properties.load(in);
            }
        } catch (IOException ignored) {
            // an unreadable file behaves like a missing one
        }
        return properties;
    }
}
`

/** Adds the helper class when some file calls it and none of the files already is it. */
export function withTestDataHelper(files: GeneratedFile[]): GeneratedFile[] {
  const needed = files.some((f) => f.content.includes('TestData.get('))
  const present = files.some((f) => f.filename === JAVA_TEST_DATA_HELPER_PATH)
  if (!needed || present) return files
  return [...files, { filename: JAVA_TEST_DATA_HELPER_PATH, content: TEST_DATA_JAVA }]
}
