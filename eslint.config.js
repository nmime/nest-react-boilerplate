const nx = require('@nx/eslint-plugin');
const typescriptEslintParser = require('@typescript-eslint/parser');
const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const sonarjsEslintPlugin = require('eslint-plugin-sonarjs');
const reactHooksEslintPlugin = require('eslint-plugin-react-hooks');
const jsxA11yEslintPlugin = require('eslint-plugin-jsx-a11y');
const eslintConfigPrettier = require('eslint-config-prettier');
const nxScopeConstraints = require('./packages/tooling/config/nx-scope-constraints.json');

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/node_modules/**',
      '**/.nx/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.astro/**',
      '**/generated/**',
      '**/*.tsbuildinfo',
      '**/.pnp',
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
          ignoredDependencies: [],
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
              sourceTag: 'platform:tooling',
              onlyDependOnLibsWithTags: ['platform:shared', 'platform:tooling'],
            },
            {
              sourceTag: 'platform:e2e',
              onlyDependOnLibsWithTags: [
                'platform:backend',
                'platform:frontend',
                'platform:shared',
                'platform:tooling',
              ],
            },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature-main',
                'type:feature-admin',
                'type:feature-shared',
                'type:common',
                'type:asset',
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
                'type:feature-admin',
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
              sourceTag: 'type:e2e',
              onlyDependOnLibsWithTags: [
                'type:feature-main',
                'type:feature-admin',
                'type:feature-shared',
                'type:common',
                'type:asset',
                'type:data-access',
                'type:test-util',
                'type:ui',
                'type:util',
                'type:sdk',
              ],
            },
            {
              sourceTag: 'type:feature-admin',
              onlyDependOnLibsWithTags: [
                'type:feature-admin',
                'type:feature-main',
                'type:feature-shared',
                'type:common',
                'type:asset',
                'type:data-access',
                'type:test-util',
                'type:util',
                'type:sdk',
              ],
            },
            {
              sourceTag: 'type:feature-main',
              onlyDependOnLibsWithTags: [
                'type:feature-shared',
                'type:common',
                'type:asset',
                'type:data-access',
                'type:test-util',
                'type:util',
                'type:sdk',
              ],
            },
            {
              sourceTag: 'type:feature-shared',
              onlyDependOnLibsWithTags: ['type:feature-shared', 'type:common', 'type:asset', 'type:util', 'type:sdk'],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: [
                'type:feature-shared',
                'type:data-access',
                'type:common',
                'type:test-util',
                'type:util',
              ],
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
                'type:feature-admin',
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

            ...nxScopeConstraints,

            {
              sourceTag: 'framework:neutral',
              onlyDependOnLibsWithTags: ['framework:neutral', 'type:asset'],
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
        // The project service keeps one shared, incremental tsserver-based
        // program per lint process that materializes only the files that
        // process actually lints. The old `project: 'tsconfig.lint.json'`
        // setting made every lint process build and hold a full-repo program
        // (~2000 files) just to lint one app, which is what pushed a single
        // eslint process past 1.6 GB RSS. `defaultProject` keeps the previous
        // lint program as the fallback for the few files no project covers
        // (e.g. the root Playwright config), so their findings are unchanged.
        projectService: {
          // Only files no project tsconfig covers may fall back to the
          // default project; the globs must stay narrow (typescript-eslint
          // rejects `**`) because the default program is whole-repo.
          allowDefaultProject: [
            'playwright.extended.config.ts',
            'libs/frontend/ui-web/lib/.storybook/*.ts',
            'libs/frontend/ui-web/lib/.storybook/*.tsx',
          ],
          defaultProject: 'tsconfig.lint.json',
        },
        tsconfigRootDir: __dirname,
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
          // A quoted key holding a function is still a key. Records keyed by an identifier from
          // the domain -- a route id, a permission, a locale -- are kebab-case there and cannot
          // be renamed to satisfy a naming rule without breaking the thing they key.
          selector: 'objectLiteralMethod',
          format: null,
          modifiers: ['requiresQuotes'],
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
    // Hook correctness. Every project config spreads this base and ESLint
    // resolves it per linted file, so patterns must stay directory-agnostic —
    // a `libs/frontend/**` prefix silently matches nothing. `.ts` is included
    // because most shared hooks (use-auth-session-flow, use-logout, ...) are
    // plain modules; the rules are inert on backend sources, which never call
    // a bare `useX()`.
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react-hooks': reactHooksEslintPlugin,
    },
    rules: {
      ...reactHooksEslintPlugin.configs['recommended-latest'].rules,
    },
  },
  {
    // Accessibility. `.tsx` is an exact proxy for "renders JSX" in this
    // workspace — no backend or tooling source carries the extension — so
    // scoping here keeps DOM-only rules off Nest code without a path prefix.
    files: ['**/*.tsx'],
    plugins: {
      'jsx-a11y': jsxA11yEslintPlugin,
    },
    rules: {
      ...jsxA11yEslintPlugin.flatConfigs.recommended.rules,
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
      // Probe components exist to publish what a hook returned to the enclosing
      // test, which means assigning to module scope during render. Every other
      // hook rule stays on for specs.
      'react-hooks/globals': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-trivial-assertions': 'off',
      'sonarjs/prefer-specific-assertions': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
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
  {
    // The tooling package typechecks against its own relaxed tsconfig
    // (noUncheckedIndexedAccess: false, module: esnext), while this codebase's
    // type-aware lint rules were written and tuned against the workspace lint
    // program (tsconfig.lint.json). Linting tooling through the project
    // service would switch it to its own tsconfig and surface findings the
    // code intentionally works around, so keep tooling on the historical
    // whole-workspace lint program. `projectService: false` cancels the
    // service block above: ESLint's flat-config deep merge keeps the earlier
    // value when a later config sets a key to `undefined`, so only an
    // explicit `false` reaches the parser and switches it back to classic
    // `project` mode. Every other project stays on the shared service.
    files: ['packages/tooling/**/*.ts', 'packages/tooling/**/*.tsx'],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        projectService: false,
        project: 'tsconfig.lint.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
];
