# @app/frontend-ui compatibility facade

`@app/frontend-ui` is a compatibility facade only. Its source root intentionally
contains no UI/runtime implementation files; it re-exports reusable React DOM
primitives from `@app/frontend-ui-web` and non-visual i18n/query/state/runtime
helpers from `@app/frontend-runtime`.

## API boundaries

API environment and request helpers belong in `@app/frontend-api-support`.
The UI packages do not export API clients, API environment helpers, or
URL-based auth bootstrap helpers.

## Domain-ish components

`ProductShell`, table, pagination, status, notification, and resource-error
components are classified as shared UI/application-shell primitives: they accept
renderable labels/data through props and do not depend on admin/user/auth API
contracts or generated clients. Feature-specific behavior belongs in feature or
app layers that compose these primitives.
