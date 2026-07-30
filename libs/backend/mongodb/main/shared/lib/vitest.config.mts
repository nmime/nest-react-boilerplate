/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/mongodb/main/shared/lib',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.component-spec.ts'],
    globals: false,
    // The migration runner is now measured (only numbered DDL files are excluded). Its
    // remaining uncovered paths are exercised by the Testcontainers component lane, which
    // this unit config excludes, so they sit in the debt budget rather than the percentage.
    coverage: fullCoverage('coverage/libs/backend/mongodb/main/shared/lib', ['src/**/*.ts'], [], {
      branches: -24,
      functions: -2,
      lines: -22,
      statements: -22,
    }),
  },
});
