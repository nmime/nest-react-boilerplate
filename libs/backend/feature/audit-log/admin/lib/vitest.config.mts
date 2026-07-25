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
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/feature/audit-log/admin/lib',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    coverage: fullCoverage('coverage/libs/backend/feature/audit-log/admin/lib', ['src/**/*.ts'], [], {
      branches: -22,
      functions: -11,
      lines: -21,
      statements: -24,
    }),
  },
});
