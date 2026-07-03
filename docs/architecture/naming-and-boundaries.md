# Naming and boundary policy

This policy defines the canonical project, import alias, and package-name shape for the DDD/Clean Architecture migration.

## Canonical alias shapes

Use package-style flattened aliases for TypeScript imports and scoped Nx project names. Physical folders still mirror ownership boundaries; public aliases flatten those folders into one npm-compatible name after `@app/`.

| Library path shape                          | Canonical alias shape                   |
| ------------------------------------------- | --------------------------------------- |
| `libs/common/<name>/lib`                    | `@app/common-<name>`                    |
| `libs/backend/common/<name>/lib`            | `@app/backend-common-<name>`            |
| `libs/backend/feature/<scope>/<layer>/lib`  | `@app/backend-feature-<scope>-<layer>`  |
| `libs/backend/bots/<bot>/lib`               | `@app/backend-bots-<bot>`               |
| `libs/backend/postgres/main/shared/lib`     | `@app/backend-postgres-main`            |
| `libs/backend/postgres/main/<domain>/lib`   | `@app/backend-postgres-main-<domain>`   |
| `libs/frontend/<name>/lib`                  | `@app/frontend-<name>`                  |
| `libs/frontend/feature/<scope>/<layer>/lib` | `@app/frontend-feature-<scope>-<layer>` |

These aliases intentionally avoid extra ownership slashes such as `@app/backend/feature/auth/main` and runtime-ambiguous aliases such as backend libraries under `@app/common-*`.

## Boundary meaning in aliases

- `@app/common-*` is framework-neutral shared kernel or contract code under `libs/common/**`.
- `@app/backend-common-*` is backend-runtime shared infrastructure, Nest helpers, backend adapters, or backend-only utilities.
- `@app/backend-feature-<scope>-<layer>` is backend bounded-context code. The `<layer>` segment must become an explicit Clean Architecture layer (`domain`, `application`, `infrastructure`, or `interfaces`) as each context migrates. Existing `main` and `shared` layers are transitional names.
- `@app/backend-postgres-main-*` is persistence infrastructure for the main Postgres database.
- `@app/frontend-*` is frontend-runtime shared code.
- `@app/frontend-feature-<scope>-<layer>` is frontend bounded-context or feature-slice code.

## Package manifests

Libraries must not define `package.json` manifests in this repository. Keep dependencies in the root manifest or in deployable app/tooling manifests.

Allowed manifests:

- root `package.json`
- deployable app manifests under `apps/**`
- `packages/tooling/package.json`

Do not add `libs/**/package.json`. Internal libraries are linked by Nx project metadata and `tsconfig.base.json` paths, not package-manager workspaces.

## Layer naming target

Future backend feature libraries should converge on explicit layer names:

```text
libs/backend/feature/<scope>/domain/lib
libs/backend/feature/<scope>/application/lib
libs/backend/feature/<scope>/infrastructure/lib
libs/backend/feature/<scope>/interfaces/lib
```

When a deployable app wires a feature, keep the wiring in the composition root rather than in domain or application libraries. Presentation adapters call application use cases; infrastructure adapters implement ports; domain code remains framework-free.

## Generator policy

Generators must emit canonical flattened aliases and Nx project names. Generators must not create library `package.json` manifests.
