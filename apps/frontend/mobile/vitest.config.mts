/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vitest/apps/frontend/mobile',
  resolve: {
    tsconfigPaths: true,
    alias: {
      'react-native': 'react-native-web',
      ...workspaceTsconfigAliases(),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx', 'scripts/**/*.spec.mjs'],
    passWithNoTests: false,
    coverage: fullCoverage(
      'coverage/apps/frontend/mobile',
      ['src/**/*.{ts,tsx}'],
      // expo-router entrypoints need the native runtime and cannot render under jsdom.
      ['src/app/_layout.tsx', 'src/app/index.tsx'],
      {
        branches: -2,
        functions: 100,
        lines: -1,
        statements: -1,
      },
    ),
  },
});
