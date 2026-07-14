const baseConfig = require('../../../../eslint.config.js');

module.exports = [
  {
    ignores: ['tsconfig.spec.json', 'src/**/*.stories.ts', 'src/**/*.stories.tsx'],
  },
  ...baseConfig,
];
