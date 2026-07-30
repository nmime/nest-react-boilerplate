# @app/frontend-feature-user-profile

## Purpose

Platform-neutral user profile/session domain logic shared by the web `app` and
native `mobile` frontends: profile payload types, `getProfileState`, locale/theme
payload readers, and the `fetchUserProfile` data-access helper.

Only depends on `@app/frontend-api-client`, `@app/frontend-api-support`, and
`@app/frontend-runtime` — no platform (`react-dom` / `react-native`) imports — so
both platforms consume the same models and render with their own UI layer.
