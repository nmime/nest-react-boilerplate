# @app/frontend-feature-user-preferences

## Purpose

Platform-neutral user preference (locale/theme) domain logic shared by the web
`app` and native `mobile` frontends: the `useUserPreferenceControls` hook, the
`updateUserPreferences` data-access helper, and preference patch types.

Depends only on `@app/frontend-api-client`, `@app/frontend-runtime`,
`@app/frontend-feature-user-profile`, and `@tanstack/react-query` — no platform
(`react-dom` / `react-native`) imports — so both platforms drive preferences
through the same model.
