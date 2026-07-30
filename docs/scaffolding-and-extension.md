# Scaffolding and Extension Contract

This is the canonical lifecycle for turning a fresh clone into a product and
for adding applications, libraries, or vertical features later. Human
contributors and coding agents must use the same commands and completion
criteria.

## What setup does

The repository separates three decisions that should not be conflated:

1. `pnpm nrb init` replaces the boilerplate identity, package/database names,
   owner, and every `example.com` frontend/API/staging hostname with the chosen
   product DNS base.
2. `pnpm nrb setup` selects existing applications and concretely activates
   capabilities. It writes config/workspace/capability/environment manifests,
   setup state, and canonical `capabilities.generated.ts` composition for every
   backend app. It does not delete unselected source or invent credentials.
3. `pnpm nrb add` generates a new app, library, or feature in the required
   architecture. A generated deployable is not publicly exposed until its
   product owner explicitly registers runtime configuration, DNS, TLS, and
   deployment ownership.

This separation keeps setup repeatable and prevents a generator from silently
publishing a new network surface.

Before choosing `nrb add`, inspect the Nx project graph, setup catalog, nearest
`AGENTS.md`, routes, and modules. Product work that belongs to an existing app,
library, or feature must modify that owner in place. A new generator root is
correct only when the product needs genuinely new runtime or library ownership;
never create a sibling clone, `-new`/`-v2` variant, generic starter app, or
nested copy of this repository to avoid understanding the existing structure.
The application, library, and feature generators enforce this for obvious
clone-style names when the base owner already exists, and `starter-app` is a
reserved non-product application name together with other generic
default/example/template names. A version-like name remains valid when
it represents genuinely new ownership and has no existing base owner.
Run `pnpm agent:verify` to exercise these behavior guards together with
repeatable setup and the canonical agent-instruction contract.
Application and library roots and Nx ownership tags are derived by the
generators; custom `--directory` and `--tags` escape hatches are rejected.
HTTP application ports are selected from the first free canonical range value;
an explicit `--port` is accepted only when it does not collide with an existing
application. Consumers and schedulers reject `--port` because they do not
expose HTTP.

## Fresh clone to verified product workspace

Run from a clean branch created from current `main`:

```bash
nvm use
corepack enable
corepack prepare pnpm@11.15.1 --activate
pnpm install --frozen-lockfile
pnpm nrb doctor

pnpm nrb init \
  --name "Acme App" \
  --domain acme.example \
  --apex-app landing-app \
  --owner acme-org \
  --dry-run
pnpm nrb init \
  --name "Acme App" \
  --domain acme.example \
  --apex-app landing-app \
  --owner acme-org

pnpm nrb setup

cp .env.example .env
# Replace placeholder secrets in .env from the environment's secret manager.
pnpm run dev:db
pnpm run db:migrate
pnpm run onboarding:verify
pnpm run dev
```

`pnpm nrb init` requires a DNS base without a protocol, port, path, or wildcard.
`--apex-app` assigns the product apex to `landing-app` or `site-app`; the other
keeps its exact app-ID hostname. Initialization rewrites the root domain and all
known subdomains, including site, mobile, admin, user, auth, public APIs, bot
APIs, staging hosts, CSP entries, TLS SANs, and example email addresses. It
never creates DNS records or certificates.

`pnpm run onboarding:verify` is a non-deploying proof after installation. It
runs the workspace doctor, resolves all five presets as dry runs with exact app
closures, then generates and builds/tests every supported application renderer
and backend/frontend/common library runtime.

## Selectable reference and optional surfaces

The repository ships complete reference implementations for each supported
runtime, but a new product selects only what it needs. No deployable is the
repository default. `fullstack` is an explicit shortcut for selecting every
core reference surface, not a mandatory baseline:

| Classification | Application/capability                                        | Why it is selected                                 |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Reference      | `admin-app` + `admin-app-api`                                 | Admin flow and RBAC boundary                       |
| Reference      | `user-app` + `user-app-api`                                   | Authenticated user flow and API boundary           |
| Reference      | `auth-app-api`                                                | Authentication/session boundary                    |
| Reference      | `landing-app`                                                 | Astro public landing surface                       |
| Reference      | `site-app`                                                    | Vike SSR site surface                              |
| Reference      | `mobile-app`                                                  | Expo/React Native client                           |
| Reference      | `fullstack-e2e`                                               | Cross-application contract and browser proof       |
| Reference      | `acceptance-e2e`                                              | Cucumber executable stakeholder specifications     |
| Selectable     | PostgreSQL, Redis, OTEL, Swagger                              | Persistence, cache, observability, and API tooling |
| Selectable     | design tokens, i18n, and authz                                | Shared UI, locale, and authorization capabilities  |
| Optional       | Discord and Telegram APIs                                     | Bot and social integrations                        |
| Optional       | NATS, S3, analytics, notifications, feature flags, websockets | Capability-driven extensions                       |

`minimal`, `web`, `enterprise`, and `bots` are deliberate alternatives,
documented in [Presets and Technologies](setup/presets-and-technologies.md).
Unselected applications remain as buildable reference implementations unless a
maintainer separately scopes their deletion.

Setup is deliberately repeatable:

```bash
# See what is selected.
pnpm nrb setup --list

# Add another frontend and its required dependencies later.
pnpm nrb setup --app mobile-app --non-interactive

# Or rerun the wizard; current choices are kept by default.
pnpm nrb setup
```

After setup, use `pnpm run docker:selected`. Capability removal rewrites all
managed backend modules and clears stale imports; `pnpm nrb doctor` detects
manual drift. Extend activation only through the machine-readable catalog
(`ownedProjects`, Docker services, environment variables, and backend wiring),
not by adding direct capability imports to app modules.

## Reference UI contract

The checked-in frontends are reference implementations, not a fictional demo
product. They prove renderer wiring, shared UI, localization, authentication,
protected state, and route ownership with neutral copy and empty-safe states.
They must not invent customers, metrics, activity, revenue, tasks, or another
business domain that a new product would have to remove.

Keep developer proof out of the default product routes. Route inventories, API
ports and service IDs, breakpoints, smoke markers, design-version labels,
coverage, readiness checklists, package counts, and deployment instructions
belong in tests, health/dev tooling, or documentation. They are not landing-page
or account-dashboard content.

After `pnpm nrb init`, extend the selected owner instead of creating a generic
starter surface:

- Replace public identity and messaging in `i18n/<locale>/landing/app.json`;
  compose the public page in `apps/frontend/landing/src/pages` and `widgets`.
- Add user product journeys under `apps/frontend/app/src/pages`, `widgets`, and
  `features`; keep the checked-in auth, profile, preferences, and social-linking
  flows unless the product explicitly replaces them.
- Add admin operations to the owning admin page/feature, backed by real API
  state and fail-closed permissions. Do not fabricate dashboard records.
- Put reusable web primitives in `@app/frontend-ui-web`, native primitives in
  `@app/frontend-ui-native`, and customer-visible copy in i18n catalogs.

A polished reference state is concise, accessible, responsive, localized, and
honest about missing data. It is not a repository status page and it is not a
preselected product design.

## Existing public domain contract

The checked-in `example.com` values are replaceable environment placeholders,
not live domains.

No deployable is selected by default. `landing-app` owns the template apex;
`pnpm nrb init --apex-app site-app` can assign the product apex to `site-app`
instead. Every other deployable follows `<app-id>.<root-domain>`. These
hostnames are the complete mapping rewritten when initialization prepares the
template for a product.

The generated [Project Catalog](project-catalog.md) owns that complete mapping,
including reference/optional classification and selection dependencies.

## Add an application

Choose one renderer and inspect the plan first:

```bash
# Frontend renderers: vite, astro, vike, expo
pnpm nrb add app customer-portal --kind frontend --renderer vite --dry-run

# Backend renderers: nest-api, consumer, scheduler
pnpm nrb add app billing-app-api \
  --kind backend \
  --renderer nest-api \
  --port 3200 \
  --dry-run

pnpm nrb add app billing-consumer \
  --kind backend \
  --renderer consumer \
  --dry-run

pnpm nrb add app billing-scheduler \
  --kind backend \
  --renderer scheduler \
  --dry-run

# Acceptance renderer: Cucumber.js
pnpm nrb add app payments-acceptance-e2e \
  --kind e2e \
  --renderer cucumber \
  --dry-run
```

Run the same command without `--dry-run`, then:

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm exec nx show project customer-portal
pnpm exec nx run customer-portal:build
pnpm exec nx run customer-portal:test
pnpm exec nx run customer-portal:typecheck
```

The generator creates the source root, Nx project configuration, applicable
package manifest, tests or executable examples, and nearest
`README.md`/`AGENTS.md`. Cucumber projects include isolated typed World state,
stable generated requirement/scenario tags, and `test`/`acceptance` targets.
Every generated executable test starts with a deterministic
`REQ-<OWNER>-SCAFFOLD-001` bootstrap marker. Before committing the new owner,
define that ID as durable product behavior or replace it with an existing
requirement, then map the exact generated Nx project in its version 3 sidecar.
The generator does not invent product semantics, copy another app, or move an
existing owner.

### Application completion checklist

A generated app is complete only after the applicable items are explicit:

- **Ownership:** product purpose, owning team, renderer, Nx tags, local port,
  and nearest `README.md`/`AGENTS.md` are correct.
- **Selection:** every generated deployable must be registered with a stable ID
  in `packages/tooling/src/setup/schema.ts`, classified with its dependencies in
  `catalog.ts`, and added to the complete `enterprise` profile in `presets.ts`.
  Add it to other intended profiles only when it belongs there, then update
  schema/planner/preset tests. `pnpm run onboarding:verify` intentionally fails
  while any real Nx application is absent from this catalog contract.
- **Environment:** add only required example variables, validation, secret
  ownership, CORS origins, API base URLs, CSP connect sources, and local ports.
- **Backend API:** keep standard `/health`, `/health/private`, `/live`, and
  `/ready`; wire auth/RBAC, RFC 9457 errors, OpenAPI, migrations, metrics, and
  request context where applicable.
- **Frontend:** choose same-origin or split-origin API routing, register routes
  through the owning app boundary, preserve FSD imports, i18n, accessibility,
  loading/empty/error states, and generated-client ownership. For a web app
  with a stable screen composition, add an app-owned `storybook/` story and
  explicitly register its glob in the shared web Storybook config. Keep Expo in
  the native test lane.
- **Local runtime:** add Compose/dev-orchestrator wiring only if the app must run
  in the selected local stack. Optional apps must remain opt-in.
- **Production runtime:** add Docker build/image ownership, Helm Deployment and
  Service values, probes, resources, NetworkPolicy, ingress route, DNS record,
  TLS certificate/SAN, and observability. A source scaffold alone is not a
  deployed service.
- **Contracts and tests:** regenerate OpenAPI/clients after API changes and add
  unit, component, Storybook interaction, integration, and e2e coverage
  proportional to the surface. Screen stories do not replace routing,
  authentication, provider, API, or complete-flow browser tests.

Use [Adding a New Service](usage/adding-a-new-service.md) for backend details.

## Add a library

Libraries must have one runtime owner, a stable public alias, and a concrete
responsibility that is written into the generated local README:

```bash
pnpm nrb add lib money --kind common --type util --scope shared --description "Normalizes monetary values for API and browser consumers." --dry-run
pnpm nrb add lib billing --kind backend --type feature-main --scope billing --description "Owns billing use cases and exposes the Nest feature module to billing APIs." --dry-run
pnpm nrb add lib billing-admin --kind backend --type feature-admin --scope billing --description "Owns billing administration endpoints and privileged application orchestration." --dry-run
pnpm nrb add lib billing-ui --kind frontend --type ui --scope billing --description "Provides billing presentation primitives to the user and admin frontends." --dry-run
```

Supported roles are `common`, `util`, `ui`, `sdk`, `feature-main`,
`feature-admin`, `feature-shared`, `data-access`, `test-util`, and `asset`.
`feature-admin` is backend-only and owns a domain's privileged HTTP and
application surface under `libs/backend/feature/<scope>/admin/lib`. Run without
`--dry-run`, then run `pnpm run lib:configs:check`, the generated project's
build/test targets, and the relevant boundary check. Generated libraries use
the owning shared runtime manifest by default; run `pnpm install` only if a
package manifest or dependency declaration changed. Do not place frontend code
in backend libraries or use relative imports across projects.

## Add a vertical feature

Use the feature generator when backend transport, persistence, and a frontend
page boundary belong to one product capability:

```bash
pnpm nrb add feature invoices \
  --api-app user-app-api \
  --frontend-app user-app \
  --dry-run
pnpm nrb add feature invoices \
  --api-app user-app-api \
  --frontend-app user-app
```

The generator creates backend shared and main libraries, MikroORM persistence
and a reversible migration, wires the Nest module, and creates an FSD
`src/pages/<feature>` boundary. It deliberately does not hand-author generated
OpenAPI/client output or invent product routing and fields.

Feature generation currently requires a `bootstrapNestApi` HTTP owner and a
Vite web application with an `src/pages` FSD boundary. Consumer, scheduler,
Astro, Vike, and Expo owners are rejected before writes. The generated
`<feature>Migrations` list is also registered in the production `db:migrate`
runner during the same generation plan. If that runner no longer exposes its
supported import and unique `migrationsList` array contract, generation fails
before creating any feature files or aliases.

Before completion:

1. Replace generic fields with product invariants and add indexes/constraints.
2. Define or replace the generated `REQ-<FEATURE>-SCAFFOLD-001` marker and map
   all three generated Nx projects in OpenSpec.
3. Review auth, RBAC, validation, repository failure, and concurrency behavior.
4. Build the owning API, then run `pnpm api:openapi`, `pnpm api:contracts`, and
   `pnpm api:clients`.
5. Register the page route and consume the generated client through a
   frontend-owned wrapper.
6. Cover auth/RBAC, loading, empty, error, validation, and success paths.

## Generator maintenance

Do not create a second scaffold path. Generator `--force` is disabled for
applications, libraries, and features; edit existing product code in place.
Extend the custom generators under
`packages/tooling/src/generators/**`, update `generators.json` and the unified
CLI only when a new generator is genuinely needed, and add regression tests.

Required generator-template verification:

```bash
pnpm run tooling:static-check
pnpm run scaffold:verify
pnpm run lib:configs:check
pnpm run frontend:fsd:check
pnpm run db:migrations:check
pnpm run api:contracts:check
pnpm run api:clients:check
pnpm run check:fast
git diff --check
```

`scaffold:verify` serializes live-workspace canaries with a temporary
workspace-specific lock. It fails rather than deleting an existing canary-named
owner and cleans source roots only when the current invocation created them. Its
in-memory feature canary applies consecutive migration registrations to the
actual production runner contract.

Broaden to component, Docker, and fullstack e2e whenever public runtime wiring
or cross-app behavior changes.
