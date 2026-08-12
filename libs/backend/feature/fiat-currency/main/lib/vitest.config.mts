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
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/feature/fiat-currency/main/lib',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    // One branch of budget, and it buys exactly one thing: esbuild's class-decorator helper takes
    // a different path for parameter decorators than for a bare `@Injectable()`, and a class that
    // has no parameter decorator can never reach the other half. It is emitted code, not ours.
    coverage: fullCoverage('coverage/libs/backend/feature/fiat-currency/main/lib', ['src/**/*.ts'], [], {
      branches: -1,
      functions: -0,
      lines: -0,
      statements: -0,
    }),
  },
});
