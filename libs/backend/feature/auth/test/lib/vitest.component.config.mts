/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../../../config/vite/workspace-tsconfig-aliases.mjs';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      ...workspaceTsconfigAliases(),
      '@app/backend-common-component-test': new URL(
        '../../../../common/component-test/lib/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  cacheDir: '../../../../dist/out-tsc/libs/backend/feature/auth/test/lib-component',
  test: {
    environment: 'node',
    include: ['src/**/*.component-spec.ts'],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: {
      enabled: false,
      provider: 'v8',
      reportsDirectory: '../../../../coverage/libs/backend/feature/auth/test/lib-component',
      reporter: ['text', 'lcov'],
      exclude: ['src/**/*.component-spec.ts'],
    },
  },
});
