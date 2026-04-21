import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const sharedConfig = {
  plugins: [tsconfigPaths(), react()],
}

const sharedTestConfig = {
  globals: false,
  setupFiles: ['./src/testing/setup.ts'],
  environment: 'jsdom' as const,
}

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedTestConfig,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
