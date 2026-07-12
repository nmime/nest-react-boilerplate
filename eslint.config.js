const nx = require('@nx/eslint-plugin');
const typescriptEslintParser = require('@typescript-eslint/parser');
const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const sonarjsEslintPlugin = require('eslint-plugin-sonarjs');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.nx/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.astro/**',
      '**/vite.config.*.timestamp*',
      'packages/tooling/src/commands/**',
    ],
  },
  {
    files: ['**/*.json'],
    rules: {
      'sonarjs/no-empty-test-file': 'off',
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
          allow: [
            '^.*/eslint(\\.base)?\\.config\\.[cm]?js$',
            '^../../../../../i18n/.+\\.json$',
            '^../../../../../../i18n/.+\\.json$',
          ],
          depConstraints: [
            {
              sourceTag: 'platform:backend',
              onlyDependOnLibsWithTags: ['platform:backend', 'platform:shared'],
            },
            {
              sourceTag: 'platform:frontend',
              onlyDependOnLibsWithTags: ['platform:frontend', 'platform:shared'],
            },
            {
              sourceTag: 'platform:shared',
              onlyDependOnLibsWithTags: ['platform:shared'],
            },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature-main',
                'type:feature-shared',
                'type:common',
                'type:data-access',
                'type:test-util',
                'type:ui',
                'type:util',
                'type:sdk',
              ],
            },
            {
              sourceTag: 'type:backend-app',
              onlyDependOnLibsWithTags: [
                'type:feature-main',
                'type:feature-shared',
                'type:common',
                'type:data-access',
                'type:test-util',
                'type:util',
                'type:sdk',
              ],
            },
            {
              sourceTag: 'type:frontend-app',
              onlyDependOnLibsWithTags: ['type:feature-shared', 'type:ui', 'type:common', 'type:util', 'type:sdk'],
            },
            {
              sourceTag: 'type:feature-main',
              onlyDependOnLibsWithTags: [
                'type:feature-shared',
                'type:common',
                'type:data-access',
                'type:test-util',
                'type:util',
                'type:sdk',
              ],
            },
            {
              sourceTag: 'type:feature-shared',
              onlyDependOnLibsWithTags: [
                'type:feature-shared',
                'type:common',
                'type:data-access',
                'type:util',
                'type:sdk',
              ],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: ['type:data-access', 'type:common', 'type:test-util', 'type:util'],
            },
            {
              sourceTag: 'type:common',
              onlyDependOnLibsWithTags: ['type:asset', 'type:common', 'type:test-util', 'type:util'],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:common', 'type:util'],
            },
            {
              sourceTag: 'type:test-util',
              onlyDependOnLibsWithTags: [
                'type:feature-main',
                'type:feature-shared',
                'type:common',
                'type:data-access',
                'type:test-util',
                'type:ui',
                'type:util',
                'type:sdk',
              ],
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:common', 'type:util'],
            },
            {
              sourceTag: 'type:sdk',
              onlyDependOnLibsWithTags: ['type:sdk', 'type:common', 'type:util'],
            },

            {
              sourceTag: 'scope:admin',
              onlyDependOnLibsWithTags: ['scope:admin', 'scope:auth', 'scope:postgres', 'scope:shared'],
            },
            {
              sourceTag: 'scope:auth',
              onlyDependOnLibsWithTags: [
                'scope:auth',
                'scope:admin',
                'scope:feature-flags',
                'scope:postgres',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'scope:user',
              onlyDependOnLibsWithTags: ['scope:user', 'scope:auth', 'scope:postgres', 'scope:shared'],
            },
            {
              sourceTag: 'scope:landing',
              onlyDependOnLibsWithTags: ['scope:landing', 'scope:shared'],
            },
            {
              sourceTag: 'scope:feature-flags',
              onlyDependOnLibsWithTags: ['scope:feature-flags', 'scope:postgres', 'scope:shared'],
            },
            {
              sourceTag: 'scope:postgres',
              onlyDependOnLibsWithTags: ['scope:postgres', 'scope:auth', 'scope:shared'],
            },

            {
              sourceTag: 'fsd:layer:shared',
              notDependOnLibsWithTags: ['fsd:layer:app'],
            },
            {
              sourceTag: 'boundary:backend-kernel',
              onlyDependOnLibsWithTags: ['boundary:backend-kernel', 'platform:shared'],
            },
            {
              sourceTag: 'boundary:infrastructure-adapter',
              onlyDependOnLibsWithTags: [
                'boundary:backend-kernel',
                'boundary:infrastructure-adapter',
                'boundary:interface-helper',
                'boundary:test-util',
                'platform:shared',
              ],
            },
            {
              sourceTag: 'boundary:interface-helper',
              onlyDependOnLibsWithTags: [
                'boundary:backend-kernel',
                'boundary:infrastructure-adapter',
                'boundary:interface-helper',
                'boundary:test-util',
                'platform:shared',
              ],
            },
            {
              sourceTag: 'boundary:test-util',
              onlyDependOnLibsWithTags: [
                'boundary:backend-kernel',
                'boundary:infrastructure-adapter',
                'boundary:interface-helper',
                'boundary:test-util',
                'platform:shared',
              ],
            },
          ],
        },
      ],
    },
  },
  sonarjsEslintPlugin.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        project: 'tsconfig.lint.json',
      },
    },
    rules: {
      ...typescriptEslintPlugin.configs['recommended-type-checked'].rules,
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      'no-await-in-loop': 'warn',
      'no-param-reassign': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'method',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'parameter',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['StrictPascalCase'],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'objectLiteralProperty',
          format: null,
        },
        {
          selector: 'typeProperty',
          format: null,
        },
      ],
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            object: 'Use Record<string, unknown>, UnknownRecord, or a more specific object shape.',
          },
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'no-public',
        },
      ],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-console': 'warn',
      'no-template-curly-in-string': 'error',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          functions: false,
          classes: false,
          variables: false,
          typedefs: false,
        },
      ],
      'no-useless-escape': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration[id.name=/Enum$/]',
          message: 'Enum names must not end with "Enum".',
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {
      ...typescriptEslintPlugin.configs.recommended.rules,
    },
  },

  {
    files: ['**/*.json'],
    rules: {
      'sonarjs/no-empty-test-file': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.tsx', '**/*.test.tsx'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-trivial-assertions': 'off',
      'sonarjs/prefer-specific-assertions': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['**/vitest*.config.mts'],
    rules: {
      'sonarjs/deprecation': 'off',
    },
  },
  {
    // Node's test registration API returns promises that are intentionally not
    // awaited at module scope; Nx Tree doubles also expose dynamic values.
    files: ['packages/tooling/src/generators/**/*.test.ts', 'packages/tooling/src/setup/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'sonarjs/assertions-in-tests': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/no-misleading-array-reverse': 'off',
      'no-await-in-loop': 'off',
      'no-console': 'off',
    },
  },
  {
    // The setup engine intentionally performs ordered filesystem mutations and
    // adapts dynamic Nx Tree values. Behavior is covered by unit/component/e2e tests.
    files: [
      'packages/tooling/src/cli.ts',
      'packages/tooling/src/generators/*/generator.ts',
      'packages/tooling/src/generators/paths.ts',
      'packages/tooling/src/setup/*.ts',
      'packages/tooling/src/setup/apply.ts',
      'packages/tooling/src/setup/catalog.ts',
      'packages/tooling/src/setup/operations.ts',
      'packages/tooling/src/setup/prompts.ts',
      'packages/tooling/src/setup/state.ts',
      'packages/tooling/src/setup/adapters/*.ts',
    ],
    rules: {
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/no-misleading-array-reverse': 'off',
      'sonarjs/no-redundant-optional': 'off',
      'sonarjs/no-nested-conditional': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-await-in-loop': 'off',
      'no-console': 'off',
    },
  },
];
