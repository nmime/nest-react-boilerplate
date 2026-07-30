import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'https://app.local.test/',
      },
    },
    globals: true,
    passWithNoTests: false,
    setupFiles: ['../../../../packages/tooling/src/testing/vitest-dom-cleanup.ts'],
    coverage: fullCoverage('coverage/libs/frontend/api-support', ['src/**/*.ts'], [], {
      branches: 100,
      functions: 100,
      lines: -1,
      statements: -1,
    }),
  },
});
