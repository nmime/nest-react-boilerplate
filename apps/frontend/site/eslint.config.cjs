const baseConfig = require('../../../eslint.config.js');

// Vite bundles the workspace libraries into the SSR output but preserves their
// external npm imports. These packages are therefore consumed by the generated
// server bundle even though the site source imports them through path aliases.
const ssrRuntimeDependencies = ['@tanstack/react-query', 'mobx', 'mobx-react-lite', 'react-dom'];

module.exports = [
  ...baseConfig,
  {
    files: ['package.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs}'],
          ignoredDependencies: ['@app/frontend-ui', ...ssrRuntimeDependencies],
          checkMissingDependencies: false,
        },
      ],
    },
  },
];
