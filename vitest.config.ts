import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    alias: {
      'server-only': path.resolve(__dirname, 'test/server-only-mock.ts'),
    },
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**'],
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      // Component tests need DOM
      ['components/**/*.test.{ts,tsx}', 'jsdom'],
      ['app/**/*.test.{ts,tsx}', 'node'],
    ],
    setupFiles: ['./vitest.setup.ts'],
  },
})
