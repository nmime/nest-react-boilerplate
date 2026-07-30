const baseConfig = require('../../../eslint.config.js');

module.exports = [{ ignores: ['metro.config.js', 'tsconfig.spec.json'] }, ...baseConfig];
