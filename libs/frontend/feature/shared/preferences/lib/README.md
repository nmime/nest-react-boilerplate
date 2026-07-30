# @app/frontend-feature-shared-preferences

## Purpose

Auth-session preference primitives shared by **every** frontend that talks to
`/auth/me` — the user web `app`, the native `mobile` app, and the `admin`
console:

- `useSessionPreferenceControls` — locale/theme state driven by
  `/auth/me/preferences`, with opt-in `guardExplicitOverrides` (latch explicit
  choices) and caller-supplied `invalidateQueryKeys` (each app invalidates its
  own profile query).
- `getPayloadLocale` / `getPayloadTheme` — read + normalize locale/theme from any
  `/auth/me`-shaped payload.
- `updateUserPreferences` / `authPreferencesQueryKey` — the preferences PATCH
  helper and the auth/me query key.
- Payload/patch types (`AuthMePayload`, `UserProfilePayload`, `LocalePayload`,
  `UserPreferencePatch`, …).

`scope:shared` so both the `scope:user` feature libs and the `scope:admin` app
can consume it. Depends only on `@app/frontend-api-client`,
`@app/frontend-runtime`, and `@tanstack/react-query` — no platform
(`react-dom` / `react-native`) imports.

## Verify

```
pnpm exec nx run-many -t build test typecheck lint -p @app/frontend-feature-shared-preferences
```
