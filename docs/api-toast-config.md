# API toast configuration

The boilerplate ships tooling for API response toast configuration without adding a separate hosted admin app. The tooling reads the app-local OpenAPI contracts in `apps/backend/*/*-app-api/contracts/openapi/**` and writes both the backend contract and its frontend runtime projection:

```text
apps/backend/<scope>/<app>-app-api/contracts/toast/<app>-app-api.toast-rules.generated.json
libs/frontend/api-client/lib/src/generated/toast/<app>-app-api.toast-rules.frontend.generated.json
```

## Generate

```bash
pnpm run api:toast-config:generate
```

Each generated rule contains:

- endpoint identity: app, method, path, operation id, tags;
- response matching: status and optional stable problem `errorCode` from the OpenAPI response schema (`code` / `errorCode` const, enum, example, or default);
- runtime match variants such as `POST_200`, `POST_400_bad-request`, `POST_ERR`, and `POST_NET`;
- toast display contract: mode (`toast`, with `modal`, `custom`, and `silent` listed as supported runtime extension modes), category (`success`, `error`, `warning`, `info`), text key/default text, icon, color, duration, options, and an `enabled` flag.

Success rules are generated disabled so product teams can opt in deliberately. Error rules are enabled; generic `401` rules are `silent` because the authentication overlay owns that flow. The frontend projection contains translation keys rather than generated English prose and uses the normalized problem message as its optional toast message.

## Check

```bash
pnpm run api:toast-config:check
```

The checker validates that generated JSON is aligned with the current OpenAPI contracts:

- every endpoint/method/status/error-code response in OpenAPI has a config rule;
- no stale endpoint/status/error-code rule remains after a contract change;
- rule shape includes category, text key/default text, icon/color metadata, duration/options, display mode, and enabled flag;
- each JSON artifact points back to its owning app-local OpenAPI contract.

## Runtime ownership

Generated JSON is read-only. Change the owning controller/OpenAPI response or the generator, regenerate, and commit the synchronized artifacts. Endpoint-specific product overrides belong in application-owned `ApiToastRule` sources; do not hand-edit generated files or add a standalone editor app.

`@app/frontend-api-client` imports the frontend projections directly. Rules match method, status, stable problem `code`, and endpoint. OpenAPI path parameters such as `/users/{userId}` match the concrete request path without treating arbitrary strings as regular expressions. The runtime resolves `titleKey` against the current locale at display time and only reads `messageSource: "problem"` from a normalized API error.
