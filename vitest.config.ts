import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@locator': resolve(__dirname, 'src/locator-engine'),
      '@codegen': resolve(__dirname, 'src/codegen'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@storage': resolve(__dirname, 'src/storage'),
    },
  },
})
