/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../../../config/vite/workspace-tsconfig-aliases.mjs';

export default defineConfig({
  resolve: { tsconfigPaths: true, alias: workspaceTsconfigAliases() },
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/mongodb/main/auth/lib-component',
  test: {
    environment: 'node',
    include: ['src/**/*.component-spec.ts'],
    globals: false,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
