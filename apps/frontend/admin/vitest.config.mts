/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../packages/tooling/src/testing/vitest-coverage.mts';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vitest/apps/frontend/admin',
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'https://app.local.test/',
      },
    },
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    passWithNoTests: false,
    coverage: fullCoverage(
      'coverage/apps/frontend/admin',
      [
        'src/App.tsx',
        'src/entities/**/*.{ts,tsx}',
        'src/features/**/*.{ts,tsx}',
        'src/pages/**/*.{ts,tsx}',
        'src/widgets/**/*.{ts,tsx}',
        'src/shared/**/*.{ts,tsx}',
      ],
      [],
    ),
  },
});
