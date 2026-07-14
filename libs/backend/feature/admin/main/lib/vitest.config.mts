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
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/feature/admin/main/lib',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    coverage: fullCoverage(
      'coverage/libs/backend/feature/admin/main/lib',
      ['src/**/*.ts'],
      ['src/**/*.module.ts', 'src/**/*.dto.ts'],
      {
        branches: -2,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    ),
  },
});
