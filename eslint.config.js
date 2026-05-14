const nx = require('@nx/eslint-plugin');
const typescriptEslintParser = require('@typescript-eslint/parser');
const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const sonarjsEslintPlugin = require('eslint-plugin-sonarjs');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/node_modules', '**/vite.config.*.timestamp*'],
  },
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs}'],
          ignoredDependencies: ['@app/frontend-ui'],
          checkMissingDependencies: false,
        },
      ],
    },
    languageOptions: {
      parser: require('jsonc-eslint-parser'),
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: 'platform:backend',
              onlyDependOnLibsWithTags: ['platform:backend'],
            },
            {
              sourceTag: 'platform:frontend',
              onlyDependOnLibsWithTags: ['platform:frontend'],
            },
            {
              sourceTag: 'type:backend-app',
              onlyDependOnLibsWithTags: ['type:feature-shared', 'type:common', 'type:util', 'type:sdk'],
            },
            {
              sourceTag: 'type:frontend-app',
              onlyDependOnLibsWithTags: ['type:ui'],
            },
            {
              sourceTag: 'type:feature-shared',
              onlyDependOnLibsWithTags: ['type:feature-shared', 'type:common', 'type:util', 'type:sdk'],
            },
            {
              sourceTag: 'type:common',
              onlyDependOnLibsWithTags: ['type:common', 'type:util'],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui'],
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:common', 'type:util'],
            },
            {
              sourceTag: 'type:sdk',
              onlyDependOnLibsWithTags: ['type:sdk', 'type:common', 'type:util'],
            },
          ],
        },
      ],
    },
  },
  sonarjsEslintPlugin.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        project: 'tsconfig.*?.json',
      },
    },
    rules: {
      ...typescriptEslintPlugin.configs['recommended-type-checked'].rules,
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {
      ...typescriptEslintPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.tsx', '**/*.test.tsx'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
    },
  },
];
