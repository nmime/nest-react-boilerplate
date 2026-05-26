const base = require("../../../../eslint.config.js");

module.exports = [
  {
    ignores: ["src/generated/**", "libs/frontend/api-client/lib/src/generated/**"],
  },
  ...base,
];
