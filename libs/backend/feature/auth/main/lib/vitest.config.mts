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
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/feature/auth/main/lib',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    env: { NODE_ENV: 'test' },
    coverage: fullCoverage(
      'coverage/libs/backend/feature/auth/main/lib',
      ['src/**/*.ts'],
      ['src/index.ts', 'src/**/*.module.ts', 'src/**/*.dto.ts', 'src/**/*.swagger.ts'],
      {
        branches: -274,
        functions: -71,
        lines: -314,
        statements: -328,
      },
    ),
  },
});
