export type FrameworkId = 'playwright-ts' | 'cypress'

export interface GeneratedFile {
  filename: string
  content: string
}

export interface GeneratedCode {
  framework: FrameworkId
  files: GeneratedFile[]
}
