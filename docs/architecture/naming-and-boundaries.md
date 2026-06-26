# Naming and boundary policy

This policy defines the canonical project and import alias shape for the DDD/Clean Architecture migration. Existing aliases remain supported temporarily so current imports keep compiling while future slices migrate source code.

## Canonical alias shapes

Use path aliases that mirror the library location and runtime boundary:

| Library path shape                          | Canonical alias shape                   |
| ------------------------------------------- | --------------------------------------- |
| `libs/common/<name>/lib`                    | `@app/common/<name>`                    |
| `libs/backend/common/<name>/lib`            | `@app/backend/common/<name>`            |
| `libs/backend/feature/<scope>/<layer>/lib`  | `@app/backend/feature/<scope>/<layer>`  |
| `libs/backend/bots/<bot>/lib`               | `@app/backend/bots/<bot>`               |
| `libs/backend/postgres/main/shared/lib`     | `@app/backend/postgres/main`            |
| `libs/backend/postgres/main/<domain>/lib`   | `@app/backend/postgres/main/<domain>`   |
| `libs/frontend/<name>/lib`                  | `@app/frontend/<name>`                  |
| `libs/frontend/feature/<scope>/<layer>/lib` | `@app/frontend/feature/<scope>/<layer>` |

These aliases intentionally avoid legacy collapsed names such as `@app/feature-auth-main`, `@app/postgres-main-auth`, `@app/frontend-ui`, and runtime-ambiguous aliases such as backend libraries under `@app/common/*`.

## Boundary meaning in aliases

- `@app/common/*` is framework-neutral shared kernel or contract code under `libs/common/**`.
- `@app/backend/common/*` is backend-runtime shared infrastructure, Nest helpers, backend adapters, or backend-only utilities.
- `@app/backend/feature/<scope>/<layer>` is backend bounded-context code. The `<layer>` segment must become an explicit Clean Architecture layer (`domain`, `application`, `infrastructure`, or `interfaces`) as each context migrates. Existing `main` and `shared` layers are transitional names.
- `@app/backend/postgres/main/*` is persistence infrastructure for the main Postgres database.
- `@app/frontend/*` is frontend-runtime shared code.
- `@app/frontend/feature/<scope>/<layer>` is frontend bounded-context or feature-slice code.

## Temporary compatibility aliases

The current `tsconfig.base.json` keeps all existing aliases and adds canonical aliases for existing projects. During migration:

1. New code should import through the canonical alias for its library path.
2. Existing code may keep legacy aliases until the owning feature slice is migrated.
3. Do not add new legacy aliases.
4. Do not remove compatibility aliases until all imports, generated templates, lint rules, and project documentation have switched to canonical aliases.

Compatibility aliases are source-compatible only; they do not change project ownership or allowed dependencies. A library imported through a legacy alias still belongs to the runtime and layer implied by its physical path.

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

Generators should emit canonical aliases once their templates and tests are updated in a dedicated slice. Until then, generator output may still require a follow-up migration step. This foundation slice does not change generator code.
