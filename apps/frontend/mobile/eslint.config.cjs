const baseConfig = require('../../../eslint.config.js');

const expoRuntimeDependencies = [
  '@expo/log-box',
  '@expo/metro-runtime',
  'expo-constants',
  'expo-linking',
  'react',
  'react-dom',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-screens',
  'react-native-web',
  'react-native-worklets',
];

module.exports = [
  { ignores: ['metro.config.js', 'tsconfig.spec.json'] },
  ...baseConfig,
  {
    files: ['package.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs}'],
          ignoredDependencies: ['@app/frontend-ui', ...expoRuntimeDependencies],
          checkMissingDependencies: false,
        },
      ],
    },
  },
];
