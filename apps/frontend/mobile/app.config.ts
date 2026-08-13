import type { ConfigContext, ExpoConfig } from 'expo/config';

const defaultApiBaseUrl = 'same-origin';
// Kept in step with `defaultProductBrand.name` in @app/frontend-api-support, which the spec asserts
// against. Expo's config loader resolves this file without the workspace TypeScript paths, so the
// shared constant cannot be imported here and the default has to be restated.
const defaultProductName = 'Nest React Boilerplate';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // Expo puts this in the exported web document's <title>. It is the one shell that neither the
  // Vite brand transform nor the Astro template reaches, so without reading the same key it stays
  // boilerplate-branded however a product configures the rest of the frontend.
  name: process.env.VITE_PRODUCT_NAME?.trim() || defaultProductName,
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
