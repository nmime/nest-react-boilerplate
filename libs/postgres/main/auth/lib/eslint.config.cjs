const baseConfig = require("../../../../../eslint.config.js");

module.exports = [
  {
    ignores: [
      "eslint.config.cjs",
      "project.json",
      "package.json",
      "tsconfig*.json",
      "vitest.config.mts",
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
    files: ["**/*.component-spec.ts"],
    rules: {
      "@nx/enforce-module-boundaries": "off",
    },
  },
];
