const baseConfig = require("../../../../../../eslint.config.js");

module.exports = [
  {
    ignores: [
      "eslint.config.cjs",
      "project.json",
      "package.json",
      "tsconfig*.json",
      "vitest.component.config.mts",
    ],
  },
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: "tsconfig.*?.json",
      },
    },
  },
  {
    files: ["src/**/*spec.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
];
