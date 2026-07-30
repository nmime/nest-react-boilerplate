# mobile-app

## Ownership

This app owns the Expo Router entrypoint, native app config, Metro/Babel config,
and mobile-specific tests. Shared native UI belongs in `libs/frontend/ui-native`.
Do not import web-only `ui-web` primitives into native screens.
Keep `*.spec.*` and `*.test.*` modules outside `src/app`: Expo Router treats
that directory as production routes, so route-local tests can pull Vitest/Vite
into Metro's application graph. `src/expo-route-boundary.spec.ts` enforces this
boundary.

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
Metro/Hermes bundle.
It does not claim APK installation, signing, simulator launch, or device startup;
those remain responsibilities of the native `android` and `ios` targets.

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Service port registry](../../../docs/PORTS.md)
- [Frontend FSD](../../../docs/frontend-fsd.md)
- [Frontend state](../../../docs/frontend-state.md)
