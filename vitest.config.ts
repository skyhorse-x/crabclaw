import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.test.ts', 'server/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/**/*.ts'],
      exclude: ['server/**/*.d.ts', 'server/types/**']
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'server'),
      '@shared': resolve(__dirname, 'server/shared'),
      '@services': resolve(__dirname, 'server/services'),
      '@routes': resolve(__dirname, 'server/routes')
    }
  }
})
