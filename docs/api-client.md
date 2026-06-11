# Type-safe frontend API clients

Frontend clients use `openapi-typescript`, `openapi-fetch`, and `openapi-react-query`.

```bash
pnpm api:openapi -- --app auth-app-api --output libs/common/api-contracts/openapi/auth-app-api.json
pnpm api:openapi -- --app user-app-api --output libs/common/api-contracts/openapi/user-app-api.json
pnpm api:openapi -- --app backend-admin-app-api --output libs/common/api-contracts/openapi/admin-app-api.json
pnpm api:contracts
pnpm api:clients
pnpm api:clients:check
```

Committed generated OpenAPI contracts live under `libs/common/api-contracts/openapi`. They are generated API contracts, not hand-authored docs; regenerate with `pnpm api:contracts`. CLI compatibility aliases such as `--docs-root` remain accepted where simple, but new usage should prefer `--contracts-root`.

Checked-in generated frontend artifacts live at:

- `libs/frontend/api-client/lib/src/generated/auth.ts`
- `libs/frontend/api-client/lib/src/generated/user.ts`
- `libs/frontend/api-client/lib/src/generated/admin.ts`

`@app/api-client` wraps those generated `paths/components/operations` types in service modules exported as `authApi`, `userApi`, and `adminApi`. Apps import DTOs, success payload aliases, typed error aliases, query keys/options, and mutation/query helpers from those namespaces instead of importing contracts directly or embedding endpoint path strings.

When backend routes, DTOs, response wrappers, auth metadata, or error decorators change:

1. Regenerate contracts with `pnpm api:contracts`.
2. Regenerate frontend client types with `pnpm api:clients`.
3. Commit both `libs/common/api-contracts/openapi` output and frontend generated artifacts.
4. Run `pnpm api:contracts:check`, `pnpm api:clients:check`, `pnpm api:openapi:lint`, and affected tests.
