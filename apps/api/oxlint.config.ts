import { base, node, promise, unicorn, vitest } from '@infra-x/code-quality/lint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  // depend() and drizzle() are temporarily disabled: their JS plugins can crash
  // oxlint with `oxc_allocator fixed_size` in this workspace.
  extends: [
    base(),
    unicorn(),
    node(),
    promise(),
    vitest({ files: ['**/*.{test,spec}.ts', '**/*.e2e-spec.ts', '**/__tests__/**/*.ts'] }),
  ],
  rules: {
    // NestJS exception filter .catch() is not Promise.catch().
    'promise/valid-params': 'off',
  },
  overrides: [
    {
      files: ['**/*.{ts,mts,cts,tsx}'],
      rules: {
        // NestJS empty decorated classes are valid (modules, controllers).
        'typescript/no-extraneous-class': ['error', { allowWithDecorator: true }],
        // NestJS DI requires runtime class references — disable without type-aware linting.
        'typescript/consistent-type-imports': 'off',
      },
    },
    {
      // DTO files conventionally bundle related request/response classes;
      // test files declare e2e fixtures and helper classes inline.
      files: ['**/dtos/**/*.ts', '**/__tests__/**/*.ts', '**/*.e2e-spec.ts'],
      rules: {
        'max-classes-per-file': 'off',
      },
    },
  ],
})
