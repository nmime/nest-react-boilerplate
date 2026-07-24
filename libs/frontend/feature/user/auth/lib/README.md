# @app/frontend-feature-user-auth

Platform-neutral auth-session domain logic shared by the web `app` and native
`mobile` frontends: auth form/request types + `AuthMode`, the `createAuthSession`
/ `fetchAuthMe` data-access helpers, and the `useAuthSessionFlow` hook that owns
the login/register + profile-resolution flow.

Depends only on `@app/frontend-api-client`, `@app/frontend-api-support`,
`@app/frontend-runtime`, `@app/frontend-feature-user-profile`, and
`@tanstack/react-query` — no platform (`react-dom` / `react-native`) imports.
