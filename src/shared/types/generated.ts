export type FrameworkId = 'playwright-ts' | 'cypress' | 'selenium-py' | 'selenium-java'

export interface GeneratedFile {
  filename: string
  content: string
}

export interface GeneratedCode {
  framework: FrameworkId
  files: GeneratedFile[]
}
