const nx = require("@nx/eslint-plugin");
const typescriptEslintParser = require("@typescript-eslint/parser");
const typescriptEslintPlugin = require("@typescript-eslint/eslint-plugin");
const sonarjsEslintPlugin = require("eslint-plugin-sonarjs");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = [
  ...nx.configs["flat/base"],
  ...nx.configs["flat/typescript"],
  ...nx.configs["flat/javascript"],
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.nx/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/vite.config.*.timestamp*",
      "packages/tooling/src/commands/**",
    ],
  },
  {
    files: ["**/*.json"],
    rules: {
      "sonarjs/no-empty-test-file": "off",
      "@nx/dependency-checks": [
        "error",
        {
          ignoredFiles: ["{projectRoot}/eslint.config.{js,cjs,mjs}"],
          ignoredDependencies: ["@app/frontend-ui", "@app/frontend/ui"],
          checkMissingDependencies: false,
        },
      ],
    },
    languageOptions: {
      parser: require("jsonc-eslint-parser"),
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          allow: [
            "^.*/eslint(\\.base)?\\.config\\.[cm]?js$",
            "^../../../../../i18n/.+\\.json$",
            "^../../../../../../i18n/.+\\.json$",
          ],
          depConstraints: [
            {
              sourceTag: "platform:backend",
              onlyDependOnLibsWithTags: ["platform:backend", "platform:shared"],
            },
            {
              sourceTag: "platform:frontend",
              onlyDependOnLibsWithTags: [
                "platform:frontend",
                "platform:shared",
              ],
            },
            {
              sourceTag: "platform:shared",
              onlyDependOnLibsWithTags: ["platform:shared"],
            },
            {
              sourceTag: "type:app",
              onlyDependOnLibsWithTags: [
                "type:feature-main",
                "type:feature-shared",
                "type:common",
                "type:data-access",
                "type:test-util",
                "type:ui",
                "type:util",
                "type:sdk",
              ],
            },
            {
              sourceTag: "type:backend-app",
              onlyDependOnLibsWithTags: [
                "type:feature-main",
                "type:feature-shared",
                "type:common",
                "type:data-access",
                "type:test-util",
                "type:util",
                "type:sdk",
              ],
            },
            {
              sourceTag: "type:frontend-app",
              onlyDependOnLibsWithTags: [
                "type:feature-shared",
                "type:ui",
                "type:common",
                "type:util",
                "type:sdk",
              ],
            },
            {
              sourceTag: "type:feature-main",
              onlyDependOnLibsWithTags: [
                "type:feature-shared",
                "type:common",
                "type:data-access",
                "type:test-util",
                "type:util",
                "type:sdk",
              ],
            },
            {
              sourceTag: "type:feature-shared",
              onlyDependOnLibsWithTags: [
                "type:feature-shared",
                "type:common",
                "type:data-access",
                "type:util",
                "type:sdk",
              ],
            },
            {
              sourceTag: "type:data-access",
              onlyDependOnLibsWithTags: [
                "type:data-access",
                "type:common",
                "type:test-util",
                "type:util",
              ],
            },
            {
              sourceTag: "type:common",
              onlyDependOnLibsWithTags: [
                "type:asset",
                "type:common",
                "type:test-util",
                "type:util",
              ],
            },
            {
              sourceTag: "type:ui",
              onlyDependOnLibsWithTags: ["type:ui", "type:common", "type:util"],
            },
            {
              sourceTag: "type:test-util",
              onlyDependOnLibsWithTags: [
                "type:feature-main",
                "type:feature-shared",
                "type:common",
                "type:data-access",
                "type:test-util",
                "type:ui",
                "type:util",
                "type:sdk",
              ],
            },
            {
              sourceTag: "type:util",
              onlyDependOnLibsWithTags: ["type:common", "type:util"],
            },
            {
              sourceTag: "type:sdk",
              onlyDependOnLibsWithTags: [
                "type:sdk",
                "type:common",
                "type:util",
              ],
            },

            {
              sourceTag: "scope:admin",
              onlyDependOnLibsWithTags: [
                "scope:admin",
                "scope:auth",
                "scope:postgres",
                "scope:shared",
              ],
            },
            {
              sourceTag: "scope:auth",
              onlyDependOnLibsWithTags: [
                "scope:auth",
                "scope:admin",
                "scope:feature-flags",
                "scope:postgres",
                "scope:shared",
              ],
            },
            {
              sourceTag: "scope:user",
              onlyDependOnLibsWithTags: [
                "scope:user",
                "scope:auth",
                "scope:postgres",
                "scope:shared",
              ],
            },
            {
              sourceTag: "scope:landing",
              onlyDependOnLibsWithTags: ["scope:landing", "scope:shared"],
            },
            {
              sourceTag: "scope:feature-flags",
              onlyDependOnLibsWithTags: [
                "scope:feature-flags",
                "scope:postgres",
                "scope:shared",
              ],
            },
            {
              sourceTag: "scope:postgres",
              onlyDependOnLibsWithTags: [
                "scope:postgres",
                "scope:auth",
                "scope:shared",
              ],
            },
          ],
        },
      ],
    },
  },
  sonarjsEslintPlugin.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        project: "tsconfig.*?.json",
      },
    },
    rules: {
      ...typescriptEslintPlugin.configs["recommended-type-checked"].rules,
    },
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    rules: {
      ...typescriptEslintPlugin.configs.recommended.rules,
    },
  },

  {
    files: ["**/*.json"],
    rules: {
      "sonarjs/no-empty-test-file": "off",
    },
  },
  {
    files: ["**/*.spec.ts", "**/*.test.ts", "**/*.spec.tsx", "**/*.test.tsx"],
    rules: {
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-hardcoded-passwords": "off",
      "sonarjs/no-trivial-assertions": "off",
      "sonarjs/prefer-specific-assertions": "off",
    },
  },
  {
    files: ["**/vitest*.config.mts"],
    rules: {
      "sonarjs/deprecation": "off",
    },
  },
];
