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
2. `pnpm nrb setup` selects existing applications and capabilities. It writes
   `nrb.config.json`, `.nrb/workspace.json`, `.nrb/summary.md`, and setup state.
   It does not delete unselected source or invent production credentials.
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
application. Workers reject `--port` because they do not expose HTTP.

## Fresh clone to verified product workspace

Run from a clean branch created from current `main`:

```bash
nvm use
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm install --frozen-lockfile
pnpm nrb doctor

pnpm nrb init \
  --name "Acme App" \
  --domain acme.example \
  --owner acme-org \
  --dry-run
pnpm nrb init \
  --name "Acme App" \
  --domain acme.example \
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
It rewrites the root domain and all known subdomains, including site, mobile,
admin, user, auth, public APIs, bot APIs, staging hosts, CSP entries, TLS SANs,
and example email addresses. It never creates DNS records or certificates.

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

## Existing public domain contract

The checked-in `example.com` values are replaceable environment placeholders,
not live domains.

No deployable is selected by default. `landing-app` is the canonical public
entry point and owns the apex domain. Every other deployable follows
`<app-id>.<root-domain>`. These hostnames are the complete mapping rewritten
when `pnpm nrb init` prepares the template for a product.

| Deployable         | Template hostname              | Catalog class |
| ------------------ | ------------------------------ | ------------- |
| `landing-app`      | `example.com`                  | reference     |
| `site-app`         | `site-app.example.com`         | reference     |
| `user-app`         | `user-app.example.com`         | reference     |
| `admin-app`        | `admin-app.example.com`        | reference     |
| `mobile-app`       | `mobile-app.example.com`       | reference     |
| `auth-app-api`     | `auth-app-api.example.com`     | reference     |
| `user-app-api`     | `user-app-api.example.com`     | reference     |
| `admin-app-api`    | `admin-app-api.example.com`    | reference     |
| `discord-app-api`  | `discord-app-api.example.com`  | optional      |
| `telegram-bot-api` | `telegram-bot-api.example.com` | optional      |

## Add an application

Choose one renderer and inspect the plan first:

```bash
# Frontend renderers: vite, astro, vike, expo
pnpm nrb add app customer-portal --kind frontend --renderer vite --dry-run

# Backend renderers: nest-api, worker
pnpm nrb add app billing-app-api \
  --kind backend \
  --renderer nest-api \
  --dry-run \
  -- --port=3200
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

The generator creates the source root, Nx project configuration, package
manifest, tests, and nearest `README.md`/`AGENTS.md`. It never requires copying
or moving another app.

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
  loading/empty/error states, and generated-client ownership.
- **Local runtime:** add Compose/dev-orchestrator wiring only if the app must run
  in the selected local stack. Optional apps must remain opt-in.
- **Production runtime:** add Docker build/image ownership, Helm Deployment and
  Service values, probes, resources, NetworkPolicy, ingress route, DNS record,
  TLS certificate/SAN, and observability. A source scaffold alone is not a
  deployed service.
- **Contracts and tests:** regenerate OpenAPI/clients after API changes and add
  unit, component, integration, and e2e coverage proportional to the surface.

Use [Adding a New Service](usage/adding-a-new-service.md) for backend details.

## Add a library

Libraries must have one runtime owner and a stable public alias:

```bash
pnpm nrb add lib money --kind common --type util --scope shared --dry-run
pnpm nrb add lib billing --kind backend --type feature-main --scope billing --dry-run
pnpm nrb add lib billing-ui --kind frontend --type ui --scope billing --dry-run
```

Supported roles are `common`, `util`, `ui`, `sdk`, `feature-main`,
`feature-shared`, `data-access`, `test-util`, and `asset`. Run without
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

Before completion:

1. Replace generic fields with product invariants and add indexes/constraints.
2. Review auth, RBAC, validation, repository failure, and concurrency behavior.
3. Build the owning API, then run `pnpm api:openapi`, `pnpm api:contracts`, and
   `pnpm api:clients`.
4. Register the page route and consume the generated client through a
   frontend-owned wrapper.
5. Cover auth/RBAC, loading, empty, error, validation, and success paths.

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

Broaden to component, Docker, and fullstack e2e whenever public runtime wiring
or cross-app behavior changes.
