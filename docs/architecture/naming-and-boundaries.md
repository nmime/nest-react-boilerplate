# Naming and boundary policy

This policy defines the canonical project, import alias, and package-name shape for the DDD/Clean Architecture migration.

## Canonical alias shapes

Use package-style flattened aliases for TypeScript imports and scoped Nx project names. Physical folders still mirror ownership boundaries; public aliases flatten those folders into one npm-compatible name after `@app/`.

| Library path shape                                 | Canonical alias shape                   |
| -------------------------------------------------- | --------------------------------------- |
| `libs/common/<name>/lib`                           | `@app/common-<name>`                    |
| `libs/backend/common/<name>`                       | `@app/backend-common-<name>`            |
| `libs/backend/feature/<scope>/<layer>/lib/<layer>` | `@app/backend-<scope>-<layer>`          |
| `libs/backend/postgres/main/shared/lib`            | `@app/backend-postgres-main`            |
| `libs/backend/mongodb/main/shared/lib`             | `@app/backend-mongodb-main`             |
| `libs/frontend/<name>/lib`                         | `@app/frontend-<name>`                  |
| `libs/frontend/feature/<scope>/<layer>/lib`        | `@app/frontend-feature-<scope>-<layer>` |

These aliases intentionally avoid extra ownership slashes such as `@app/backend/feature/auth/main` and runtime-ambiguous aliases such as backend libraries under `@app/common-*`.

## Boundary meaning in aliases

- `@app/common-*` is framework-neutral shared kernel or contract code under `libs/common/**`.
- `@app/backend-common-*` is backend-runtime shared infrastructure, Nest helpers, backend adapters, or backend-only utilities.
- `@app/backend-<scope>-<layer>` is backend bounded-context code. The `<layer>` segment can be a runtime-specific capability such as `main`, `shared`, `bot`, or `postgres`; it should become an explicit Clean Architecture layer (`domain`, `application`, `infrastructure`, or `interfaces`) as each context migrates.
- `@app/backend-postgres-main` and `@app/backend-mongodb-main` are the mutually
  exclusive shared durable-provider infrastructures. Feature-owned persistence
  retains its domain scope, for example `@app/backend-postgres-main-auth` or
  `@app/backend-mongodb-main-auth`.
- `@app/frontend-*` is frontend-runtime shared code.
- `@app/frontend-feature-<scope>-<layer>` is frontend bounded-context or feature-slice code.

## Package manifests

Package manifests are split by dependency ownership. Keep shared repository
tooling and true cross-runtime/common dependencies in the root manifest. Keep
all backend external dependencies in `libs/backend/package.json`, and all
frontend external dependencies in `libs/frontend/package.json`. Nx
`project.json` owns deployable identity and targets; source imports provide
app-specific external dependency graph edges without identity manifests.

Allowed manifests:

- root `package.json`
- platform dependency manifests:
  - `libs/backend/package.json`
  - `libs/frontend/package.json`
- dependency-only renderer manifests under `apps/frontend/**` when the renderer
  requires nearest-package dependency metadata; these must not define app
  identity, scripts, or entrypoints
- `packages/tooling/package.json`

Do not add application identity manifests or nested library manifests such as
`libs/backend/feature/<scope>/<layer>/lib/package.json` or
`libs/frontend/<name>/lib/package.json`. Internal libraries are linked by Nx
project metadata and `tsconfig.base.json` paths; only dependency-group manifests
are package-manager workspaces.

## Layer naming target

Future backend feature libraries should converge on explicit layer names:

```text
libs/backend/feature/<scope>/<layer>/lib/domain
libs/backend/feature/<scope>/<layer>/lib/application
libs/backend/feature/<scope>/<layer>/lib/infrastructure
libs/backend/feature/<scope>/<layer>/lib/interfaces
```

When a deployable app wires a feature, keep the wiring in the composition root rather than in domain or application libraries. Presentation adapters call application use cases; infrastructure adapters implement ports; domain code remains framework-free.

## Generator policy

Generators must emit canonical flattened aliases and Nx project names.
Generators must not create application identity or nested-library
`package.json` manifests. A renderer generator may create a dependency-only
manifest when the renderer demonstrably consumes nearest-package dependency
metadata.
