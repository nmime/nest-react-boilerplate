# Frontend FSD boundaries

Frontend applications and shared frontend libraries are checked by `pnpm run frontend:fsd:check`.

The strict layer order is:

```text
app -> pages -> widgets -> features -> entities -> shared
```

A source file may import only its own FSD unit or lower layers. Same-slice relative internals are allowed. Layer public APIs (for example `src/pages/index.ts` aggregating page slice indexes, or `src/app/index.ts` exporting the app implementation) may aggregate same-layer public slice APIs without being reported as cross-slice consumers.

The checker fails on:

- higher-layer imports;
- sibling cross-slice imports within non-shared layers, except from the layer public API barrel;
- imports that bypass another slice/project public `index.ts` API;
- imports from one frontend application into another frontend application, while allowing an app entrypoint such as `main.tsx` to import its own `./app` public API;
- frontend files that disable Nx/module/FSD/import boundary rules;
- frontend projects missing explicit `fsd:layer:*` tags;
- a root ESLint config that removes or disables `@nx/enforce-module-boundaries`.

Workspace-level frontend projects must be tagged explicitly:

- `apps/frontend/*`: `fsd:layer:app`
- `libs/frontend/*`: `fsd:layer:shared`

Run locally:

```bash
pnpm run frontend:fsd:check
pnpm run frontend:fsd:check -- --self-test
pnpm run tooling:static-check
```

## API boundary rule

Frontend app and feature code should consume backend data through `@app/api-client` wrappers. Generated files under `libs/frontend/api-client/lib/src/generated/**` are implementation details of the API-client library, and request plumbing belongs in `@app/frontend-api-support`. This keeps FSD slices independent from backend endpoint strings and generated OpenAPI internals.
