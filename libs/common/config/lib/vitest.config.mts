/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
// nx-ignore-next-line
import { fullCoverage } from '../../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: fullCoverage('coverage/libs/common/config/lib', ['src/**/*.ts']),
  },
});
