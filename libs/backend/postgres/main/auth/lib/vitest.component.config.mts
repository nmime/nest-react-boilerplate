/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../../../config/vite/workspace-tsconfig-aliases.mjs';

export default defineConfig({
  resolve: { tsconfigPaths: true, alias: workspaceTsconfigAliases() },
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/postgres/main/auth/lib-component',
  test: {
    environment: 'node',
    include: ['src/**/*.component-spec.ts'],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: { enabled: false },
  },
});
