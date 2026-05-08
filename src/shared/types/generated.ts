export type FrameworkId = 'playwright-ts' | 'cypress' | 'selenium-py'

export interface GeneratedFile {
  filename: string
  content: string
}

export interface GeneratedCode {
  framework: FrameworkId
  files: GeneratedFile[]
}
