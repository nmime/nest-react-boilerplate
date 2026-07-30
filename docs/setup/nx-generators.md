# Repository Generators

Use the custom `@repo/tooling` generators through `pnpm nrb add`. They encode
this repository's nested app/library layout, Nx tags, TypeScript configuration,
tests, public aliases, and nearest agent/ownership documentation. Generic Nx
application generators are not the canonical scaffold path.

## Canonical commands

```bash
pnpm nrb add app <name> --kind <frontend|backend|e2e> --renderer <renderer> --dry-run
pnpm nrb add lib <name> --kind <frontend|backend|common> --type <type> --scope <scope> --description "<concrete responsibility>" --dry-run
pnpm nrb add feature <name> --api-app <api> --frontend-app <frontend> --dry-run
```

Run without `--dry-run` only after inspecting every planned path. Application
and library generation use Nx `project.json` ownership without creating package
identity manifests. Astro and Expo receive dependency-only manifests because
their toolchains require nearest-package dependency metadata. If generated source
needs a missing external dependency, add it to
the owning backend/frontend platform manifest, run `pnpm install`, and prove
`pnpm install --frozen-lockfile`.

## Application generator

`@repo/tooling:application` supports:

| Kind     | Renderer    | Generated contract                                              |
| -------- | ----------- | --------------------------------------------------------------- |
| frontend | `vite`      | React/Vite app, Vitest, browser e2e coverage target             |
| frontend | `astro`     | Astro output, smoke test, and dependency-only renderer manifest |
| frontend | `vike`      | Vike React SSR app and production build contract                |
| frontend | `expo`      | Expo Router/React Native app and web export contract            |
| backend  | `nest-api`  | NestJS/Fastify API with standard health endpoints               |
| backend  | `consumer`  | NestJS application-context event/queue consumer                 |
| backend  | `scheduler` | NestJS application-context scheduler with `ScheduleModule`      |
| e2e      | `cucumber`  | Cucumber.js acceptance app with isolated typed World state      |

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
`feature-admin`, `feature-shared`, `data-access`, `test-util`, and `asset`.
Backend `data-access` libraries accept `--database postgres|mongodb`; the
generator otherwise derives exactly one selected provider from
`.nrb/workspace.json` and rejects mismatches.

`feature-admin` is backend-only and generates the privileged domain boundary at
`libs/backend/feature/<scope>/admin/lib`; API applications compose it while the
domain's normal runtime remains in `feature-main`.

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
| `libs/backend/<provider>/main/<name>/lib/**` | Provider-owned persistence              |
| `apps/frontend/<target>/src/pages/<name>/**` | FSD page public boundary                |
| `docs/features/<name>/scaffold.md`           | Product completion checklist            |

Pass `--database postgres|mongodb`, or let the generator derive the workspace's
single durable provider. PostgreSQL creates a MikroORM entity, repository, and
reversible migration. MongoDB creates a strict collection validator,
deterministic indexes, a transactional native-driver repository, and
replica-set component coverage. It also creates the three stable backend aliases
and wires the feature module into the selected API. The owners must be a
`bootstrapNestApi` HTTP application
and a Vite web application with an `src/pages` FSD boundary; incompatible
consumer, scheduler, Astro, Vike, and Expo combinations fail before writes. The
generator exports the feature migration list and atomically registers it with
the production `db:migrate` runner, refusing generation when that explicit
runner contract cannot be updated safely. It does not hand-edit generated
OpenAPI/client output or invent product fields and routing.

Generated executable tests use the deterministic bootstrap marker
`REQ-<OWNER>-SCAFFOLD-001`. Define or replace it in OpenSpec and map the exact
generated Nx project before running `pnpm spec:validate` downstream.

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

`scaffold:verify` generates all eight application renderer/process variants plus
backend, frontend, and common libraries in the live workspace. It builds, tests,
and typechecks all eleven projects through Nx with finite per-project/target
budgets scaled for Node, browser, SSR, and native work. It isolates Nx workspace
data, holds a workspace-specific process lock, and refuses to touch an existing
canary owner root. It removes source roots only after the current invocation
created them. The same harness applies two features to the source-backed
production migration runner in memory to prove repeatable registration without
mutating product owners.
Generator unit and setup e2e tests cover name/path rules, schema validation,
dependency expansion, conflicts, rollback, and idempotency.

## Extending generators

Modify `packages/tooling/src/generators/**` and its tests. Keep
`packages/tooling/generators.json`, `packages/tooling/src/commands/project/add.ts`,
CLI docs, generated README/AGENTS contracts, and scaffold verification aligned.
Do not create a parallel shell-script or copy-directory scaffold path.

See [Extending Generators](extending-generators.md) for the internal setup
planner and generator code map.
