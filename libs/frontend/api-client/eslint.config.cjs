const base = require("../../../eslint.config.js");

module.exports = [
  {
    ignores: ["lib/src/generated/**", "libs/frontend/api-client/lib/src/generated/**"],
  },
  ...base,
];
