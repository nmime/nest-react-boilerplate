const baseConfig = require("../../../../eslint.config.js");

module.exports = [
  {
    ignores: [
      "tsconfig.spec.json",
      ".storybook/**/*.ts",
      "src/**/*.stories.ts",
      "src/**/*.stories.tsx",
    ],
  },
  ...baseConfig,
];
