# @app/frontend-feature-user-social-auth

Platform-neutral social-auth (Telegram Mini App / Telegram OIDC / Discord)
domain logic shared by the web `app` and native `mobile` frontends: provider
types + identity normalization, the observable `ProviderIdentitiesModel`, the
`useSocialAuth` flow hook, the data-access helpers, and same-origin return-url
validation.

Depends only on `@app/frontend-api-client`, `@app/frontend-api-support`,
`@app/frontend-runtime`, `@app/frontend-feature-user-profile`, and
`@tanstack/react-query`. The web panel/buttons UI stays in the app.
