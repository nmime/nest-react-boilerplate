# Setup and Configuration

The NRB setup engine selects applications and concretely activates capabilities. It produces a deterministic plan, applies it idempotently, and tracks state so repeated runs are no-ops. It never deletes application source. No app is selected implicitly.

## How it works

1. **Schema** — validates your configuration against a Zod schema (`schemaVersion`, `preset`, `apps`, `capabilities`, `options`).
2. **Catalog** — defines apps/domains and machine-readable capability dependencies, owned projects, Docker services, environment variables, and Nest/bootstrap activation.
3. **Planner** — resolves presets, expands transitive dependencies, validates the selection, and generates runtime manifests plus per-backend-app module and telemetry bootstrap composition.
4. **Apply** — writes `nrb.config.json`, summary/workspace/capability manifests, environment activation, `capabilities.generated.ts` module composition, and `capabilities.bootstrap.generated.ts` pre-import initialization through a filesystem adapter with rollback on failure.
5. **State** — tracks file hashes in `.nrb/state.json` so re-runs with the same config produce zero operations.

## Interactive setup

```bash
pnpm --filter @repo/tooling tooling setup
```

The wizard guides you through:

1. **Starting point** — start with an empty `custom` selection (default) or use a profile as a shortcut.
2. **App toggles** — enable/disable each frontend, backend, and E2E app individually.
3. **Capability toggles** — enable/disable cross-cutting features.
4. **Options** — prune stale setup-managed artifacts, force overwrites, dry-run mode.

Required dependencies are auto-enabled. For example, selecting `admin-app` adds
`admin-app-api`, `auth-app-api`, `authz`, notifications, S3,
`notification-consumer`, and `notification-scheduler`, and requires exactly one
durable provider. Presets satisfy that requirement with PostgreSQL. A custom
selection may use MongoDB instead; PostgreSQL and MongoDB conflict and cannot be
selected together.

On rerun, the wizard loads the resolved current selection. Press Enter to keep
an item, answer `y` to add it, or `n` to remove it. A removal that would break
another selected app's dependency is refused or restored as required.

## Non-interactive setup (CI / scripted)

A fresh non-interactive workspace must provide `--preset`, at least one
`--app`, or `--config`; there is no CI default selection. Once configured, a
no-selection rerun preserves the existing config.

### Preset-based

```bash
pnpm --filter @repo/tooling tooling setup --preset fullstack --non-interactive
```

### Config file

Create `nrb.config.json` from the example:

```bash
cp nrb.config.example.json nrb.config.json
```

Edit it, then run:

```bash
pnpm --filter @repo/tooling tooling setup --config nrb.config.json
```

### Explicit apps and capabilities

```bash
pnpm --filter @repo/tooling tooling setup \
  --app user-app --app user-app-api --app auth-app-api \
  --capability postgres --capability i18n \
  --non-interactive
```

To swap an existing preset-backed workspace to MongoDB without changing its app
selection:

```bash
pnpm nrb setup \
  --remove-capability postgres \
  --capability mongodb \
  --non-interactive
pnpm nrb doctor
```

Setup writes matching `DATABASE_ENGINE` and `AUTH_PERSISTENCE` selectors. The
MongoDB local environment points at the credential-free `mongodb.localhost`
one-node replica set with `replicaSet=rs0&retryWrites=true`; it enables
transactions but is not an HA topology.

`--app` and `--capability` are additive when `nrb.config.json` already exists:

```bash
# Add mobile later without losing the existing web/API selection.
pnpm nrb setup --app mobile-app --non-interactive

# Inspect selected and available entries.
pnpm nrb setup --list

# Remove an optional app; dependency-breaking removals fail.
pnpm nrb setup --remove-app landing-app --non-interactive

# Deliberately replace the complete selection.
pnpm nrb setup --replace --app landing-app --non-interactive
```

### Dry run

```bash
pnpm --filter @repo/tooling tooling setup --preset fullstack --dry-run
```

Shows the plan without modifying any files.

### JSON output

```bash
pnpm --filter @repo/tooling tooling setup --preset fullstack --dry-run --json
```

Outputs the resolved config, operations, and summary as JSON for scripting.

## Configuration schema

| Field                    | Type       | Description                                                            |
| ------------------------ | ---------- | ---------------------------------------------------------------------- |
| `schemaVersion`          | `string`   | Must be `"1.0.0"`.                                                     |
| `preset`                 | `string`   | Optional. One of: `minimal`, `web`, `fullstack`, `enterprise`, `bots`. |
| `apps`                   | `string[]` | List of app IDs to enable.                                             |
| `capabilities`           | `string[]` | List of capability IDs to enable.                                      |
| `options.prune`          | `boolean`  | Remove stale setup-managed files only (default `false`).               |
| `options.force`          | `boolean`  | Overwrite conflicts without asking (default `false`).                  |
| `options.dryRun`         | `boolean`  | Show plan only (default `false`).                                      |
| `options.nonInteractive` | `boolean`  | Records that setup ran without prompts (default `false`).              |

Unknown top-level keys are rejected with a clear error. Every field is validated against an explicit enum.

### Example config

```json
{
  "schemaVersion": "1.0.0",
  "apps": ["landing-app", "user-app"],
  "capabilities": ["mongodb", "otel", "swagger"],
  "options": {
    "prune": false,
    "force": false,
    "dryRun": false,
    "nonInteractive": false
  }
}
```

## `pnpm nrb doctor`

Run workspace health checks:

```bash
pnpm --filter @repo/tooling tooling doctor
```

### Checks performed

| Check               | Status              | Description                                                                                         |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `runtime-version`   | pass/fail           | JavaScript runtime version must match the repository Node.js or Bun contract.                       |
| `pnpm`              | pass/fail           | pnpm must be exactly `11.11.0`.                                                                     |
| `docker`            | pass/skip           | Docker availability (optional for E2E).                                                             |
| `manifests`         | pass/fail           | `package.json`, `tsconfig.base.json` present.                                                       |
| `lock-file`         | pass/warn           | `pnpm-lock.yaml` present.                                                                           |
| `nx-graph`          | pass/warn           | Nx project graph resolves.                                                                          |
| `nrb-config`        | pass/fail/warn/skip | `nrb.config.json` validity.                                                                         |
| `nrb-state`         | pass/fail/warn/skip | `.nrb/state.json` consistency.                                                                      |
| `capability-wiring` | pass/fail/skip      | Generated manifests, environment, and backend module wiring match the saved config.                 |
| `compose-selection` | pass/fail/skip      | Selected Compose service graph resolves (when Docker is available).                                 |
| `tooling-package`   | pass/fail/warn      | `@repo/tooling` bin entries.                                                                        |
| `selected-closure`  | pass/fail/warn/skip | Selected Nx graph and package manifests match setup; selected lock is current or explicitly absent. |

### JSON output

```bash
pnpm --filter @repo/tooling tooling doctor --json
```

Returns a structured JSON object with `checks` array and `summary` counts. Exit code is `1` if any check fails.

## State management

The setup engine tracks state in `.nrb/state.json`:

- **`configHash`** — SHA-256 hash of the resolved config.
- **`files`** — map of file paths to content hashes.

On each run:

1. The planner computes desired file content.
2. The diff engine compares desired hashes against `.nrb/state.json`.
3. Operations are created only for changed files.
4. After apply, `.nrb/state.json` is updated.

This guarantees idempotency: running setup twice with the same config produces zero planner operations and verifies the same selected closure digest.

Development, local database, release, and selected-closure commands validate
both the current configuration hash and a newly computed live Nx graph digest
before using `.nrb/closure.json`. Any mismatch fails with instructions to rerun
`pnpm nrb setup`; there is no stale or all-reference product fallback.

Explicit maintainer materialization writes complete provider-isolated contexts
under `.nrb/reference/<provider>/`, including closure/config/workspace metadata,
scoped package and pnpm workspace manifests, explicit Helm selection values, an
offline lockfile, and lock
integrity metadata. PostgreSQL and MongoDB contexts are independent and do not
create a product selection. Their package locks and installs include only the
selected provider's OpenTelemetry database instrumentation; provider-free
contexts include neither database instrumentation package.

Setup also writes `.helm/values-selection.yaml` and
`.nrb/Caddyfile.per-app-domains` and `.nrb/Caddyfile.single-domain` from the
selected closure. They record the same
deployable app IDs and provider, disable every unselected chart app and edge
site, and disable the migrator for provider-free selections. Product Compose
and Helm commands fail closed rather than choosing all reference apps.

The resolved `.nrb/workspace.json` groups apps by platform. `.nrb/capabilities.json` records project, service, environment, generated-file, module, and transport-import ownership. `.nrb/closure.json` records the selected roots, transitive Nx projects, available targets, exact `productExternalPackages`, separate `toolingExternalPackages`, Compose services, `releaseImages`, provider, and graph/config digests. Lint, typecheck, and test-like targets list every eligible transitive closure project, not only application roots. Provider-free selections contain only their app images; durable PostgreSQL or MongoDB selections also contain `migrator`. MongoDB services include initialization and `mongodb-migrate`. Release/Bake planning can only reduce this set, including for force-full builds. Its sibling package and pnpm workspace manifests install product packages as dependencies and source-tooling support as devDependencies. A provider swap invalidates an existing selected lock rather than retaining the opposite provider. `pnpm nrb closure install` deletes prior workspace dependency links, installs a clean selected tree under `.nrb/closure/node_modules`, and links only selected project roots; `pnpm run tooling:install` explicitly restores the full maintainer tree. `.nrb/capabilities.env` activates Compose/bootstrap flags, including the selected durable provider when the selection needs one, and every backend app imports only its generated capability module. `pnpm run dev:fullstack` consumes explicit serve projects from the closure. `pnpm run docker:selected` validates the environment's exact apps, capabilities, profiles, and rendered services against the fresh closure before launch. It accepts a provider-free graph for selections such as a standalone landing app and rejects stale app/profile leakage, conflicting providers, or missing migration/preparation services. Doctor validates both the selected closure and exact Compose dependency graph when Docker is available. Before setup these commands fail with an instruction to select apps; they never fall back to a hidden profile.

## Recovery

- **Stale state**: delete `.nrb/state.json` and re-run setup.
- **Conflicting files**: use `--force` or manually resolve.
- **Dirty worktree**: setup writes only its managed config/state files, but you should still review `git diff` before applying a plan.
- **Failed rollback**: the apply engine rolls back on failure. If rollback itself fails, the `rollbackError` message explains what went wrong.

## Staging Environment

Staging is a production mirror used for pre-release validation. It runs the same
application stack with staging-specific secrets, databases, and domain names.

### Setup

1. **Create the staging environment file:**

   ```bash
   cp .env.staging.example .env.staging
   ```

2. **Fill in staging-specific values** in `.env.staging`:
   - `DATABASE_ENGINE` and `AUTH_PERSISTENCE` — select the same durable provider.
   - PostgreSQL: set `DATABASE_URL`; MongoDB: set `MONGODB_URI`,
     `MONGODB_DATABASE`, and `MONGODB_REPLICA_SET` for a transaction-capable
     replica set.
   - `SESSION_SECRET` and `BETTER_AUTH_SECRET` — use unique secrets (never reuse production values).
   - Domain names — change all `example.com` references to `staging.example.com`.
   - Bot tokens — use staging/test bot credentials if available.

3. **Review the explicit `COMPOSE_PROFILES` list** in `.env.staging`. Remove
   services that staging does not need, then start the profile-gated topology:

   ```bash
   COMPOSE_PROFILES="$(grep '^COMPOSE_PROFILES=' .env.staging | cut -d= -f2-)" \
     docker compose --env-file .env.staging \
       -f docker/docker-compose.yml up -d --build
   ```

   Do not source the whole file into a shell: secret values can contain shell
   metacharacters. `--env-file` supplies interpolation values, while the
   explicit process-level `COMPOSE_PROFILES` activates the selected profiles.

4. **Staging port offsets:** staging services use ports offset by +100 from
   production defaults to avoid collisions. See [PORTS.md](../PORTS.md#staging).

### CI/CD — Deploying to Staging

There is no automated staging pipeline; staging shares the production deploy
path. Deployment runs from the manual `deploy` workflow
(`.github/workflows/deploy.yml`), triggered via `workflow_dispatch`:

- **Trigger:** manual `workflow_dispatch` with a full 40-character `git_sha`
  that is an ancestor of `origin/main` and whose selected-and-enabled deployment
  image set already exists with immutable digests.
- **Image tag:** `sha-<git_sha>`.
- **Helm:** renders `.helm/values-production.yaml` (there is no
  `values-staging.yaml` overlay in the repo).
- **Namespace:** `nest-react-boilerplate`.
- **GitOps:** commits the updated deploy tags to a `gitops/sha-<git_sha>`
  branch for Argo CD / Flux to reconcile.
- **Rollback:** re-run the workflow with the previous known-good Git SHA.

### Running Staging Locally

```bash
# Using docker compose
COMPOSE_PROFILES="$(grep '^COMPOSE_PROFILES=' .env.staging | cut -d= -f2-)" \
  docker compose --env-file .env.staging \
    -f docker/docker-compose.yml up -d --build

# Using Helm (against a staging cluster).
# The repo ships only values-production.yaml; supply your own staging
# overlay with an extra `-f` if you maintain one.
helm upgrade --install nrb ./.helm \
  -f .helm/values-production.yaml \
  -f .helm/values-selection.yaml \
  --namespace staging
```

## Next steps

- [Presets and Technologies](presets-and-technologies.md) — full preset matrix and support table.
- [CLI Reference](cli-reference.md) — every command with flags and examples.
- [Troubleshooting](troubleshooting.md) — detailed recovery procedures.
