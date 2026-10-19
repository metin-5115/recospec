import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierConfig from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'test-harness/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        crypto: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        Intl: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        HTMLInputElement: 'readonly',
        Element: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MouseEvent: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        XMLHttpRequest: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
  {
    // Pure layers: code generation and the locator engine must not reach into storage, the
    // service worker or the UI. (Tests may seed IndexedDB.)
    files: ['src/codegen/**/*.ts', 'src/locator-engine/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.test-util.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@storage/*', '**/storage/*'],
              message: 'Pure layers must not read IndexedDB — load in the caller and pass data in.',
            },
            {
              group: ['@/background/*', '@/side-panel/*', '@/popup/*', '@/content/*'],
              message: 'Pure layers must not depend on extension surfaces.',
            },
          ],
        },
      ],
    },
  },
  {
    // `shared` sits below every layer: it may not import codegen, which depends on it.
    files: ['src/shared/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@codegen/*', '@locator/*'],
              message: 'shared is imported by codegen — move the type or helper into shared.',
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
  {
    ignores: ['dist/', 'node_modules/', '*.config.*', '*.cjs'],
  },
]
