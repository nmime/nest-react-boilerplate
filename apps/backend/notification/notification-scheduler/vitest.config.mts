/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  cacheDir: '../../../../node_modules/.vitest/apps/backend/notification/notification-scheduler',
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.e2e-spec.ts'],
    globals: false,
    coverage: fullCoverage('coverage/apps/backend/notification/notification-scheduler', ['src/**/*.ts'], []),
  },
});
