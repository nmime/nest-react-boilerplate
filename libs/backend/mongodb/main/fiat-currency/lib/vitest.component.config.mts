/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { workspaceCoverageDirectory } from '../../../../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/mongodb/main/fiat-currency/lib-component',
  test: {
    environment: 'node',
    include: ['src/**/*.component-spec.ts'],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: {
      enabled: false,
      provider: 'v8',
      reportsDirectory: workspaceCoverageDirectory('coverage/libs/backend/mongodb/main/fiat-currency/lib-component'),
      reporter: ['text', 'lcov'],
      exclude: ['src/**/*.component-spec.ts'],
    },
  },
});
