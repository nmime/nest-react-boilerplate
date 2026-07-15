# Setup and Configuration

The NRB setup engine selects the applications and capabilities used by repository tooling. It produces a deterministic plan, applies it idempotently, and tracks state so repeated runs are no-ops. It never deletes application source; selection is recorded in `.nrb/workspace.json` and consumed by commands such as `dev:fullstack`. No app is selected implicitly.

## How it works

1. **Schema** — validates your configuration against a Zod schema (`schemaVersion`, `preset`, `apps`, `capabilities`, `options`).
2. **Catalog** — pure data that defines apps, capabilities, their dependencies, and conflicts.
3. **Planner** — resolves presets, expands transitive dependencies, validates the selection, and produces a sorted list of file operations.
4. **Apply** — writes `nrb.config.json`, `.nrb/summary.md`, and the runtime-consumed `.nrb/workspace.json` through a filesystem adapter with rollback on failure.
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

Required dependencies are auto-enabled. For example, selecting `admin-app` auto-enables `admin-app-api`, `authz`, and `design-tokens`.

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
  "capabilities": ["otel", "swagger"],
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

| Check             | Status              | Description                                   |
| ----------------- | ------------------- | --------------------------------------------- |
| `node-version`    | pass/fail           | Node.js version must satisfy `>=24 <25`.      |
| `pnpm`            | pass/fail           | pnpm must be exactly `11.11.0`.               |
| `docker`          | pass/skip           | Docker availability (optional for E2E).       |
| `manifests`       | pass/fail           | `package.json`, `tsconfig.base.json` present. |
| `lock-file`       | pass/warn           | `pnpm-lock.yaml` present.                     |
| `nx-graph`        | pass/warn           | Nx project graph resolves.                    |
| `nrb-config`      | pass/fail/warn/skip | `nrb.config.json` validity.                   |
| `nrb-state`       | pass/fail/warn/skip | `.nrb/state.json` consistency.                |
| `tooling-package` | pass/fail/warn      | `@repo/tooling` bin entries.                  |

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

This guarantees idempotency: running setup twice with the same config produces zero operations.

The resolved `.nrb/workspace.json` groups apps by platform. `pnpm run dev:fullstack` reads it and starts only the selected deployables. Before setup it fails with an instruction to select apps; it never falls back to a hidden profile.

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
   - `DATABASE_URL` — point to the staging database instance.
   - `SESSION_SECRET` and `JWT_SECRET` — use unique secrets (never reuse production values).
   - Domain names — change all `example.com` references to `staging.example.com`.
   - Bot tokens — use staging/test bot credentials if available.

3. **Set env vars before starting services:**

   ```bash
   # Load staging env into the compose environment
   export $(grep -v '^#' .env.staging | xargs)

   # Or pass explicitly to docker compose
   docker compose --env-file .env.staging up -d
   ```

4. **Staging port offsets:** staging services use ports offset by +100 from
   production defaults to avoid collisions. See [PORTS.md](../PORTS.md#staging).

### CI/CD — Deploying to Staging

The CI pipeline deploys to staging automatically on PR merge to the `staging`
branch (or when tagged with a staging label):

- **Trigger:** merge to `staging` branch or PR labeled `deploy-staging`.
- **Image tag:** `preview/<short-sha>` or `edge-<date>`.
- **Helm:** applies `values-staging.yaml` on top of `values-production.yaml`.
- **Namespace:** `staging` (isolated from production).
- **Rollback:** revert the merge or re-trigger CI on the previous commit.

### Running Staging Locally

```bash
# Using docker compose
NODE_ENV=staging docker compose --profile staging -f docker/docker-compose.yml up -d

# Using Helm (against a staging cluster)
helm upgrade --install nrb ./.helm \
  -f .helm/values-production.yaml \
  -f .helm/values-staging.yaml \
  --namespace staging
```

## Next steps

- [Presets and Technologies](presets-and-technologies.md) — full preset matrix and support table.
- [CLI Reference](cli-reference.md) — every command with flags and examples.
- [Troubleshooting](troubleshooting.md) — detailed recovery procedures.
