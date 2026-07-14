/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  cacheDir: '../../../../node_modules/.vitest/apps/backend/telegram/telegram-bot-api',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    coverage: fullCoverage('coverage/apps/backend/telegram/telegram-bot-api', ['src/**/*.ts'], []),
  },
});
