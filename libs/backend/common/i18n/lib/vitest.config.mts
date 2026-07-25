import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  cacheDir: '../../../../../node_modules/.vitest/libs/backend/common/i18n/lib',
  resolve: { tsconfigPaths: true, alias: workspaceTsconfigAliases() },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: fullCoverage('coverage/libs/backend/common/i18n', ['src/**/*.ts'], [], {
      branches: 100,
      functions: -1,
      lines: -1,
      statements: -1,
    }),
  },
});
