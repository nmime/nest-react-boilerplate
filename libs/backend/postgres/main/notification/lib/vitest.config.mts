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
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/postgres/main/notification/lib',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.component-spec.ts'],
    globals: false,
    coverage: fullCoverage('coverage/libs/backend/postgres/main/notification/lib', ['src/**/*.ts'], [], {
      branches: -347,
      functions: -140,
      lines: -625,
      statements: -637,
    }),
  },
});
