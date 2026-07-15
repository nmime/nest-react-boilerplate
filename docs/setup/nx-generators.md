# Repository Generators

Use the custom `@repo/tooling` generators through `pnpm nrb add`. They encode
this repository's nested app/library layout, Nx tags, TypeScript configuration,
tests, public aliases, and nearest agent/ownership documentation. Generic Nx
application generators are not the canonical scaffold path.

## Canonical commands

```bash
pnpm nrb add app <name> --kind <frontend|backend> --renderer <renderer> --dry-run
pnpm nrb add lib <name> --kind <frontend|backend|common> --type <type> --scope <scope> --dry-run
pnpm nrb add feature <name> --api-app <api> --frontend-app <frontend> --dry-run
```

Run without `--dry-run` only after inspecting every planned path. Application
generation creates a package manifest, so run `pnpm install` afterward and prove
`pnpm install --frozen-lockfile`. Generated libraries use their owning shared
runtime manifest unless a maintainer explicitly introduces a package boundary.

## Application generator

`@repo/tooling:application` supports:

| Kind     | Renderer   | Generated contract                                       |
| -------- | ---------- | -------------------------------------------------------- |
| frontend | `vite`     | React/Vite app, Vitest, browser e2e coverage target      |
| frontend | `astro`    | Astro standalone Node output and renderer smoke test     |
| frontend | `vike`     | Vike React SSR app and production build contract         |
| frontend | `expo`     | Expo Router/React Native app and web export contract     |
| backend  | `nest-api` | NestJS/Fastify API with standard health endpoints        |
| backend  | `worker`   | NestJS application-context worker without HTTP transport |

Frontend roots are `apps/frontend/<name>`. Backend roots are
`apps/backend/<first-name-segment>/<name>`. Every generated root includes a
local `README.md` and `AGENTS.md`.

Generation deliberately does not publish DNS/TLS or add the app to every
preset/deployment. Its catalog hostname must be `<app-id>.example.com`; complete
the explicit registration checklist in
[Scaffolding and Extension Contract](../scaffolding-and-extension.md).

Once a generated application is registered in the setup catalog, select it in
an existing product without resetting the other choices:

```bash
pnpm nrb setup --app <catalog-id> --non-interactive
```

Use `pnpm nrb setup --list` to inspect the current and available selections.

## Library generator

`@repo/tooling:library` supports backend, frontend, and common runtimes plus
semantic roles `common`, `util`, `ui`, `sdk`, `feature-main`,
`feature-shared`, `data-access`, `test-util`, and `asset`.

It derives the required `libs/backend/**`, `libs/frontend/**`, or
`libs/common/**` path, Nx boundary tags, public TypeScript alias, build/test
configuration, and local ownership files. Use the feature generator when the
main/shared/data-access libraries form one vertical product slice.

## Feature generator

`@repo/tooling:feature` creates:

| Path                                         | Ownership                               |
| -------------------------------------------- | --------------------------------------- |
| `libs/backend/feature/<name>/shared/lib/**`  | DTOs and permissions                    |
| `libs/backend/feature/<name>/main/lib/**`    | Nest module, controller, service, tests |
| `libs/backend/postgres/main/<name>/lib/**`   | MikroORM entity, repository, migration  |
| `apps/frontend/<target>/src/pages/<name>/**` | FSD page public boundary                |
| `docs/features/<name>/scaffold.md`           | Product completion checklist            |

It also creates the three stable backend aliases and wires the feature module
into the selected API. It does not hand-edit generated OpenAPI/client output or
invent product fields and routing.

## Nx inference

`nx.json` registers repository plugins that infer lint, Vite build/serve/test,
and TypeScript targets where appropriate. Generated projects also declare
explicit targets when a renderer or backend build needs a repository-specific
contract. Inspect the resolved project instead of assuming a target:

```bash
pnpm exec nx show project <project-name>
```

The workspace currently pins Nx `23.1.0`; package manifests and the lockfile
are the source of truth for exact versions.

## Verification

```bash
pnpm run tooling:static-check
pnpm run scaffold:verify
pnpm run lib:configs:check
pnpm run frontend:fsd:check
pnpm run check:fast
git diff --check
```

`scaffold:verify` generates all six application renderer/process variants plus
backend, frontend, and common libraries in the live workspace. It builds/tests
all nine projects through Nx, typechecks the applicable frontends, then removes
the canary roots. Generator unit and setup e2e tests cover name/path rules,
schema validation, dependency expansion, conflicts, rollback, and idempotency.

## Extending generators

Modify `packages/tooling/src/generators/**` and its tests. Keep
`packages/tooling/generators.json`, `packages/tooling/src/commands/project/add.ts`,
CLI docs, generated README/AGENTS contracts, and scaffold verification aligned.
Do not create a parallel shell-script or copy-directory scaffold path.

See [Extending Generators](extending-generators.md) for the internal setup
planner and generator code map.
