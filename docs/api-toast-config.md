# API toast configuration

The boilerplate ships tooling for API response toast configuration without adding a separate hosted admin app. The tooling reads the app-local OpenAPI contracts in `apps/backend/*-app-api/contracts/openapi/**` and writes app-local JSON artifacts beside them:

```text
apps/backend/<app>-app-api/contracts/toast/<app>-app-api.toast-rules.generated.json
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

Success rules are scaffolded disabled by default so product teams can opt in to success toasts. Error rules are enabled by default.

## Check

```bash
pnpm run api:toast-config:check
```

The checker validates that generated JSON is aligned with the current OpenAPI contracts:

- every endpoint/method/status/error-code response in OpenAPI has a config rule;
- no stale endpoint/status/error-code rule remains after a contract change;
- rule shape includes category, text key/default text, icon/color metadata, duration/options, display mode, and enabled flag;
- each JSON artifact points back to its owning app-local OpenAPI contract.

## Optional editor UI

A hosted editor is optional and should be same-app/admin tooling if needed. The recommended flow is to edit the generated JSON through an internal admin page or repository-backed form that reads/writes these artifacts, then run `pnpm run api:toast-config:check` before merging. Do not introduce a fake standalone app just to host this editor; the JSON files are the source of truth consumed by runtime code.

Runtime code can import or bundle the JSON artifacts directly, or a future frontend build step can copy them into a shared frontend artifact. The matching contract mirrors the generated `match.variant` fields: exact endpoint/method/status/errorCode first, status-only success matches next, then method-level error/network fallbacks.
