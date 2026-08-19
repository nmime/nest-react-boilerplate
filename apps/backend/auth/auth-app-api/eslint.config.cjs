const baseConfig = require('../../../../eslint.config.js');

module.exports = [
  {
    ignores: ['eslint.config.cjs', 'project.json', 'package.json', 'tsconfig*.json', 'vitest.config.mts'],
  },
  ...baseConfig,
  {
    // Nest and Better Auth test doubles expose intentionally untyped surfaces.
    files: ['src/**/*spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      'sonarjs/todo-tag': 'off',
    },
  },
];
