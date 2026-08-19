const baseConfig = require('../../../../../../eslint.config.js');

module.exports = [
  {
    ignores: ['eslint.config.cjs', 'project.json', 'tsconfig*.json', 'vitest.config.mts'],
  },
  ...baseConfig,
  {
    // Better Auth's adapter boundary exposes untyped records. Keep correctness
    // rules enabled while isolating unsafe-value checks to this boundary.
    files: [
      'src/application/better-auth.ts',
      'src/application/better-auth-api.controller.ts',
      'src/application/plugins/*.ts',
      'src/application/scripts/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      'sonarjs/no-try-promise': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/todo-tag': 'off',
      'no-console': 'off',
    },
  },
  {
    // Migration steps are intentionally serial to preserve referential order.
    files: ['src/application/scripts/*.ts'],
    rules: {
      'no-await-in-loop': 'off',
    },
  },
  {
    files: ['src/application/plugins/telegram.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/hardcoded-secret-signatures': 'off',
    },
  },
  {
    // Test doubles intentionally model the untyped Better Auth handler surface.
    files: ['src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },
];
