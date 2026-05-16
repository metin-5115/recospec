import type { GeneratedFile } from '@shared/types/generated'
import type { TestDataConfig } from '../../ir/types'

let TEST_DATA: TestDataConfig | undefined
export function setSeleniumJavaScaffoldTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

const POM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.playforge</groupId>
    <artifactId>generated-tests</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <selenium.version>4.16.1</selenium.version>
        <testng.version>7.10.2</testng.version>
        <webdrivermanager.version>5.6.3</webdrivermanager.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.seleniumhq.selenium</groupId>
            <artifactId>selenium-java</artifactId>
            <version>\${selenium.version}</version>
        </dependency>
        <dependency>
            <groupId>org.testng</groupId>
            <artifactId>testng</artifactId>
            <version>\${testng.version}</version>
        </dependency>
        <dependency>
            <groupId>io.github.bonigarcia</groupId>
            <artifactId>webdrivermanager</artifactId>
            <version>\${webdrivermanager.version}</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.2.5</version>
                <configuration>
                    <suiteXmlFiles>
                        <suiteXmlFile>testng.xml</suiteXmlFile>
                    </suiteXmlFiles>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
`

const TESTNG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE suite SYSTEM "https://testng.org/testng-1.0.dtd">
<suite name="PlayForge Generated Suite" verbose="1">
    <test name="GeneratedTests">
        <packages>
            <package name="tests"/>
        </packages>
    </test>
</suite>
`

const GITIGNORE = `target/
.idea/
*.iml
.vscode/
screenshots/
`

export function renderScaffold(): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { filename: 'pom.xml', content: POM_XML },
    { filename: 'testng.xml', content: TESTNG_XML },
    { filename: '.gitignore', content: GITIGNORE },
  ]
  const params = TEST_DATA?.params.filter((p) => p.useEnvVar) ?? []
  if (params.length) {
    const header = '# PlayForge — copy to test-data.properties and fill in values.\n'
    const body = params.map((p) => `${p.envVarName}=${p.isSecret ? '' : p.defaultValue}`).join('\n')
    files.push({
      filename: 'src/test/resources/test-data.properties.example',
      content: `${header}${body}\n`,
    })
  }
  return files
}
