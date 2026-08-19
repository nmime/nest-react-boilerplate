const baseConfig = require('../../../../../../eslint.config.js');

module.exports = [
  {
    ignores: ['eslint.config.cjs', 'project.json', 'tsconfig*.json', 'vitest.config.mts'],
  },
  ...baseConfig,
  {
    // Delivery chunks are intentionally serialized to preserve the configured
    // per-second rate limit.
    files: ['src/service/user-notification-scheduler.service.ts'],
    rules: {
      'no-await-in-loop': 'off',
    },
  },
];
