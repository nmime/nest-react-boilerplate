/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  cacheDir: '../../../../../node_modules/.vitest/libs/backend/common/nats/lib',
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    pool: 'threads',
    maxWorkers: 1,
    testTimeout: 30_000,
    coverage: fullCoverage('coverage/libs/backend/common/nats/lib', ['src/**/*.ts'], []),
  },
});
