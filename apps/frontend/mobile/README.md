# mobile-app

## Ownership

This app owns the Expo Router entrypoint, native app config, Metro/Babel config,
and mobile-specific tests. Shared native UI belongs in `libs/frontend/ui-native`.
Do not import web-only `ui-web` primitives into native screens.

## Commands

```bash
pnpm run dev:mobile
pnpm run mobile:web
pnpm run mobile:android
pnpm run mobile:ios
pnpm run mobile:export
pnpm exec nx run mobile-app:test
pnpm exec nx run mobile-app:typecheck
pnpm run frontend:fsd:check
```

Android and iOS targets require the matching local native toolchain. Use the
[service port registry](../../../docs/PORTS.md) for the canonical web dev port.

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Service port registry](../../../docs/PORTS.md)
- [Frontend FSD](../../../docs/frontend-fsd.md)
- [Frontend state](../../../docs/frontend-state.md)
