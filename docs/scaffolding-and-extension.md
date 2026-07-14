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

pnpm nrb setup --preset starter --non-interactive --dry-run
pnpm nrb setup --preset starter --non-interactive

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

## Required baseline and optional surfaces

The neutral `starter` preset is the recommended product baseline:

| Classification | Application/capability                          | Why it is selected                                      |
| -------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Required       | `starter-app`                                   | Neutral Vite product shell without reference-product UI |
| Required       | `auth-app-api`                                  | Authentication/session boundary                         |
| Required       | `user-app-api`                                  | Product/user API boundary                               |
| Required       | PostgreSQL                                      | Auth and product persistence                            |
| Required       | design tokens and i18n                          | Shared visual/runtime baseline                          |
| Optional       | `admin-app` + `admin-app-api`                   | Reference admin flow and RBAC surface                   |
| Optional       | `user-app`                                      | Richer reference user flow                              |
| Optional       | `landing-app`                                   | Astro public marketing surface                          |
| Optional       | `site-app`                                      | Vike SSR surface                                        |
| Optional       | `mobile-app`                                    | Expo/React Native client                                |
| Optional       | Discord/Telegram APIs and Telegram worker       | Bot and social integrations                             |
| Optional       | Redis, NATS, S3, OTEL, analytics, notifications | Enable only for selected product capabilities           |

`minimal`, `fullstack`, `enterprise`, and `bots` are deliberate alternatives,
documented in [Presets and Technologies](setup/presets-and-technologies.md).
Unselected applications remain as buildable reference implementations unless a
maintainer separately scopes their deletion.

## Existing public domain contract

The checked-in `example.com` values are replaceable environment placeholders,
not live or starter-specific domains.

| Deployable         | Template hostname          | Default state |
| ------------------ | -------------------------- | ------------- |
| `landing-app`      | `example.com`              | enabled       |
| `site-app`         | `site.example.com`         | enabled       |
| `user-app`         | `app.example.com`          | enabled       |
| `admin-app`        | `admin.example.com`        | enabled       |
| `mobile-app`       | `mobile.example.com`       | enabled       |
| `auth-app-api`     | `auth.example.com`         | enabled       |
| `user-app-api`     | `api.example.com`          | enabled       |
| `admin-app-api`    | `admin-api.example.com`    | enabled       |
| `discord-app-api`  | `discord-api.example.com`  | opt-in        |
| `telegram-bot-api` | `telegram-api.example.com` | opt-in        |

`starter-app` intentionally has no permanent `starter.*` hostname. When it is
the product frontend, assign it a product-owned hostname and replace the
corresponding reference frontend in environment-specific Helm/Compose values.
See [Frontend Deployment Topology](frontend-deployment-topology.md).

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
- **Selection:** if `pnpm nrb setup` should select the app, add its stable ID to
  `packages/tooling/src/setup/schema.ts`, its dependencies to `catalog.ts`, and
  the intended preset(s) to `presets.ts`; update schema/planner/preset tests.
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
  --frontend-app starter-app \
  --dry-run
pnpm nrb add feature invoices \
  --api-app user-app-api \
  --frontend-app starter-app
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

Do not create a second scaffold path. Extend the custom generators under
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
