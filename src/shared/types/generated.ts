export interface GeneratedFile {
  filename: string
  content: string
}

export interface GeneratedCode {
  framework: 'playwright-ts'
  files: GeneratedFile[]
}
