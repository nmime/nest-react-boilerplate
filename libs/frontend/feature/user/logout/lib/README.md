# @app/frontend-feature-user-logout

Platform-neutral sign-out domain logic shared by the web `app` and native
`mobile` frontends: the observable `LogoutModel` (MobX + mobx-tanstack-query),
the `useLogout` hook, and the `requestLogout` data-access helper. The session is
always cleared client-side even if the network request fails.

Depends only on `@app/frontend-api-client`, `@app/frontend-api-support`,
`@app/frontend-runtime`, and `@tanstack/react-query` — no platform
(`react-dom` / `react-native`) imports — so both platforms share the flow.
