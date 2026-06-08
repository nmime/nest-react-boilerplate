# @app/frontend-ui boundary

`@app/frontend-ui` is the shared frontend design-system package. Its stable
public surface is limited to reusable UI primitives, layout, i18n/theme shell
widgets, and UI-only state helpers. Production UI sources must not import API
clients, API contracts, backend modules, app sources, or call raw `fetch`.

## Compatibility bridges

Existing frontend apps historically imported API environment helpers from
`@app/frontend-ui`. Those helpers are now implemented in
`@app/frontend-api-support` and re-exported from
`lib/config/frontend-env.ts` only as a deprecated migration bridge. New code
should import these helpers from `@app/frontend-api-support`.

The legacy `lib/api/api-client.ts` deep module is intentionally omitted from the
public barrel. New code must import request helpers from
`@app/frontend-api-support`.

## Domain-ish components

`ProductShell`, table, pagination, status, notification, and resource-error
components are classified as shared UI/application-shell primitives: they accept
renderable labels/data through props and do not depend on admin/user/auth API
contracts or generated clients. Feature-specific behavior belongs in feature or
app layers that compose these primitives.
