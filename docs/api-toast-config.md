# API toast configuration

The boilerplate ships OpenAPI-driven API response toast configuration and a
tenant-scoped editor inside the existing admin app. The tooling reads the
app-local OpenAPI contracts in
`apps/backend/*/*-app-api/contracts/openapi/**` and writes both the backend
contract and its frontend runtime/catalog projection:

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
- runtime match variants such as `POST_200`, `POST_400_bad-request`, `POST_ERR`, and `POST_NET`; every operation receives explicit `ERR` and `NET` fallback rows;
- toast display contract: mode (`toast`, with `modal`, `custom`, and `silent` listed as supported runtime extension modes), category (`success`, `error`, `warning`, `info`), text key/default text, icon, color, duration, options, and an `enabled` flag.

Success rules are generated as `silent` so product teams can opt in
deliberately. Error, unexpected `ERR`, and network `NET` rules are enabled;
generic `401` rules are `silent` because the authentication overlay owns that
flow. When an OpenAPI response declares stable problem codes, the generator
emits both code-specific rules and a status fallback. The frontend projection
contains translation keys, safe generated fallback copy, and catalog metadata
for the admin route.

## Check

```bash
pnpm run api:toast-config:check
```

The checker validates that generated JSON is aligned with the current OpenAPI contracts:

- every endpoint/method/status/error-code response in OpenAPI has a config rule;
- no stale endpoint/status/error-code rule remains after a contract change;
- rule shape includes category, text key/default text, icon/color metadata, duration/options, display mode, and enabled flag;
- each JSON artifact points back to its owning app-local OpenAPI contract.

## Admin overrides and runtime ownership

Generated JSON is read-only. Change the owning controller/OpenAPI response or
the generator, regenerate, and commit the synchronized artifacts. The existing
admin app route `/admin/settings/errors` merges the generated catalog with
tenant overrides from `/admin/settings/problem-presentations`. Administrators
with `admin:settings:update` can change `toast`/`silent`, severity, optional
EN/RU copy, and an internal comment. Persistence uses optimistic revisions and
writes update/reset entries to the existing admin audit log.

`@app/frontend-api-client` imports the frontend projections directly and loads
the authenticated tenant's overrides from `/auth/problem-presentations`.
Rules match method, status, stable problem `code`, transport kind, and endpoint.
OpenAPI path parameters such as `/users/{userId}` match the concrete request
path without treating arbitrary strings as regular expressions. The runtime
resolves `titleKey` and optional override copy against the current locale at
display time; otherwise it only reads `messageSource: "problem"` from a
normalized API error. Override API failures are best-effort and leave the
checked-in generated rules active.
