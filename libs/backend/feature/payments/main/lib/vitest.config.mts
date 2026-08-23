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
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/feature/payments/main/lib',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    coverage: fullCoverage(
      'coverage/libs/backend/feature/payments/main/lib',
      ['src/**/*.ts'],
      ['src/**/index.ts', 'src/**/*.module.ts', 'src/**/*.dto.ts'],
      {
        // The one synthetic branch V8 attributes to the @Injectable() decorator can never be
        // taken; the same budget the fiat-currency main lib carries.
        branches: -1,
        functions: 0,
        lines: 0,
      },
    ),
  },
});
