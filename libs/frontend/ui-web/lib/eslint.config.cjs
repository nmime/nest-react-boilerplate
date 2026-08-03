const baseConfig = require('../../../../eslint.config.js');

module.exports = [
  {
    // Stories are linted: they are the input to the Storybook interaction and
    // axe gates, so a broken story silently weakens both.
    ignores: ['tsconfig.spec.json'],
  },
  ...baseConfig,
];
