# mobile-app

## Ownership

This app owns the Expo Router entrypoint, native app config, Metro/Babel config,
and mobile-specific tests. Shared native UI belongs in `libs/frontend/ui-native`.
Do not import web-only `ui-web` primitives into native screens.
Keep `*.spec.*` and `*.test.*` modules outside `src/app`: Expo Router treats
that directory as production routes, so route-local tests can pull Vitest/Vite
into Metro's application graph. `src/expo-route-boundary.spec.ts` enforces this
boundary.

## API configuration

Expo web uses same-origin cookies by default. On iOS/Android, an unconfigured
shell applies preferences locally without attempting server writes. Configure
`EXPO_PUBLIC_API_BASE_URL` with an absolute HTTP(S) gateway URL, or configure all
three `EXPO_PUBLIC_ADMIN_API_URL`, `EXPO_PUBLIC_AUTH_API_URL`, and
`EXPO_PUBLIC_USER_API_URL` values for separate services. URLs cannot include
userinfo, query strings, or fragments; relative and `same-origin` native URLs
fail closed. Use reachable HTTPS origins for device deployments.

Native requests use `credentials: omit`. Products supply `sessionFetch` to
`MobileAppProviders` to attach their current credential from secure native
storage. This template does not supply a native login/token exchange or secure
storage implementation, and browser cookie acceptance is not device session
acceptance. Never put credentials in `EXPO_PUBLIC_*`: Expo embeds those values
in the application bundle. Include the deployment path prefix in direct API URLs
(for example, `https://auth.example.invalid/api/v1`); gateway URLs can use
their documented root routes. Runtime reads use the static property syntax
required by [Expo's environment-variable guide](https://docs.expo.dev/guides/environment-variables/).

## Commands

```bash
pnpm run dev:mobile
pnpm run mobile:web
pnpm run mobile:android
pnpm run mobile:ios
pnpm run mobile:export
pnpm exec nx run mobile-app:export-android
pnpm exec nx run mobile-app:e2e
pnpm exec nx run mobile-app:test
pnpm exec nx run mobile-app:typecheck
pnpm run frontend:fsd:check
```

Android and iOS targets require the matching local native toolchain. Use the
[service port registry](../../../docs/PORTS.md) for the canonical web dev port.
The export targets run Expo and validate their output in the same fail-closed,
cross-platform Node wrapper. `mobile-app:e2e` performs the web and Android
exports sequentially and verifies both the web entrypoint and Android
Metro/Hermes bundle. It then opens the web export in desktop Chromium, mobile
Chromium, and mobile WebKit, exercises EN/RU/ZH language controls through the
keyboard, and checks axe accessibility, overflow, and browser runtime errors.
It does not claim APK installation, signing, simulator launch, or device startup;
those remain responsibilities of the native `android` and `ios` targets.

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Service port registry](../../../docs/PORTS.md)
- [Frontend FSD](../../../docs/frontend-fsd.md)
- [Frontend state](../../../docs/frontend-state.md)
