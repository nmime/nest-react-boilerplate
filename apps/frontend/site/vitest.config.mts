/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../packages/tooling/src/testing/vitest-coverage.mts';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vitest/apps/frontend/site',
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['pages/**/*.spec.ts', 'pages/**/*.spec.tsx'],
    passWithNoTests: false,
    coverage: fullCoverage('coverage/apps/frontend/site', ['pages/**/*.{ts,tsx}'], ['pages/+config.ts']),
  },
});
