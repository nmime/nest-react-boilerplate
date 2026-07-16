import type { ConfigContext, ExpoConfig } from 'expo/config';

const defaultApiBaseUrl = 'same-origin';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Nest React Boilerplate',
  slug: 'nest-react-boilerplate-mobile',
  scheme: 'nestreact',
  version: '0.0.0',
  plugins: [...(config.plugins ?? []), 'expo-router'],
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  platforms: ['ios', 'android', 'web'],
  ios: {
    ...config.ios,
    bundleIdentifier: 'com.nmime.nestreactboilerplate.mobile',
    supportsTablet: true,
  },
  android: {
    ...config.android,
    package: 'com.nmime.nestreactboilerplate.mobile',
  },
  web: {
    ...config.web,
    bundler: 'metro',
    output: 'single',
  },
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl,
  },
});
