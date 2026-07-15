# user-app

Path: `apps/frontend/app`
Nx project: `user-app`
Package: `user-app`
Runtime: React + Vite user SPA
Local URL: `http://localhost:4201`

## Ownership

This app owns the current authenticated user SPA shell. Keep reusable user
features, API wrappers, runtime helpers, and shared UI in `libs/frontend/**`.
`site-app` is the Vike SSR surface; do not retire or replace `user-app` without
explicit parity work.

## Commands

```bash
pnpm exec nx serve user-app
pnpm exec nx build user-app
pnpm exec nx run user-app:test
pnpm exec nx run user-app:e2e
pnpm run frontend:fsd:check
```

## Telegram Mini App and browser shell

The same `user-app` bundle is the canonical Telegram Mini App and normal web
application. Configure BotFather with
`https://user-app.example.com/telegram-mini-app`; `/tma` and `/tma/auth` remain
supported launch aliases.

- `MiniAppProvider` in `@app/frontend-runtime` detects Telegram without making
  browser or server rendering depend on Telegram globals. In Telegram it mounts
  theme/viewport state, binds CSS variables, calls `ready()` and `expand()`,
  requests Bot API 8.0 fullscreen when available, and sets the branded header,
  background, and bottom-bar colors.
- `MiniAppShell` in `@app/frontend-ui-web` is the single visual shell for both
  environments. It owns safe-area spacing, the colored header and bottom
  navigation, native Telegram or browser back behavior, and Telegram/Web
  Share/clipboard fallback behavior.
- Safe-area CSS consumes both Telegram's official
  `--tg-safe-area-inset-*`/`--tg-content-safe-area-inset-*` variables and the
  equivalent `@tma.js` viewport variables. The HTML viewport includes
  `viewport-fit=cover`.
- Share URLs strip all `tgWebApp*` launch parameters before leaving the app so
  raw Telegram launch data is never copied or shared.

Do not initialize Telegram SDK features inside a page or feature. Add product
content below `MiniAppShell`, and use `useMiniApp()` only when a feature needs a
platform action beyond the shell's built-in back and share controls.

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Frontend FSD](../../../docs/frontend-fsd.md)
- [Frontend state](../../../docs/frontend-state.md)
