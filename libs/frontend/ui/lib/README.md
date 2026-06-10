# @app/frontend-ui boundary

`@app/frontend-ui` is the shared frontend design-system package. Its stable
public surface is limited to reusable UI primitives, layout, i18n/theme shell
widgets, and UI-only state helpers. Production UI sources must not import API
clients, API contracts, backend modules, app sources, or call raw `fetch`.

## API boundaries

API environment and request helpers belong in `@app/frontend-api-support`.
`@app/frontend-ui` does not export API clients, API environment helpers, or
URL-based auth bootstrap helpers.

## Domain-ish components

`ProductShell`, table, pagination, status, notification, and resource-error
components are classified as shared UI/application-shell primitives: they accept
renderable labels/data through props and do not depend on admin/user/auth API
contracts or generated clients. Feature-specific behavior belongs in feature or
app layers that compose these primitives.
