const baseConfig = require("../../../eslint.config.js");

module.exports = [
  {
    ignores: [
      "eslint.config.cjs",
      "project.json",
      "tsconfig*.json",
      "vitest.config.mts",
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
];
