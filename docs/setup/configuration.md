# Setup and Configuration

The NRB setup engine lets you configure which applications and capabilities the monorepo enables. It produces a deterministic plan, applies it idempotently, and tracks state so repeated runs are no-ops.

## How it works

1. **Schema** — validates your configuration against a Zod schema (`schemaVersion`, `preset`, `apps`, `capabilities`, `options`).
2. **Catalog** — pure data that defines apps, capabilities, their dependencies, and conflicts.
3. **Planner** — resolves presets, expands transitive dependencies, validates the selection, and produces a sorted list of file operations.
4. **Apply** — executes operations (create/update/delete) through a filesystem adapter with rollback on failure.
5. **State** — tracks file hashes in `.nrb/state.json` so re-runs with the same config produce zero operations.

## Interactive setup

```bash
pnpm --filter @repo/tooling tooling setup
```

The wizard guides you through:

1. **Preset selection** — choose a starting point (minimal, starter, fullstack, enterprise, bots).
2. **App toggles** — enable/disable each frontend, backend, and e2e app.
3. **Capability toggles** — enable/disable cross-cutting features.
4. **Options** — prune unused files, force overwrites, dry-run mode.

Required dependencies are auto-enabled. For example, selecting `admin-app` auto-enables `admin-app-api`, `authz`, and `design-tokens`.

## Non-interactive setup (CI / scripted)

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

### Dry run

```bash
pnpm --filter @repo/tooling tooling setup --preset starter --dry-run
```

Shows the plan without modifying any files.

### JSON output

```bash
pnpm --filter @repo/tooling tooling setup --preset fullstack --dry-run --json
```

Outputs the resolved config, operations, and summary as JSON for scripting.

## Configuration schema

| Field                    | Type       | Description                                                                |
| ------------------------ | ---------- | -------------------------------------------------------------------------- |
| `schemaVersion`          | `string`   | Must be `"1.0.0"`.                                                         |
| `preset`                 | `string`   | Optional. One of: `minimal`, `starter`, `fullstack`, `enterprise`, `bots`. |
| `apps`                   | `string[]` | List of app IDs to enable.                                                 |
| `capabilities`           | `string[]` | List of capability IDs to enable.                                          |
| `options.prune`          | `boolean`  | Remove files no longer needed (default `false`).                           |
| `options.force`          | `boolean`  | Overwrite conflicts without asking (default `false`).                      |
| `options.dryRun`         | `boolean`  | Show plan only (default `false`).                                          |
| `options.nonInteractive` | `boolean`  | CI mode with defaults (default `false`).                                   |

Unknown top-level keys are rejected with a clear error. Every field is validated against an explicit enum.

### Example config

```json
{
  "schemaVersion": "1.0.0",
  "preset": "fullstack",
  "apps": ["admin-app", "user-app", "admin-app-api", "user-app-api"],
  "capabilities": ["postgres", "redis", "i18n"],
  "options": {
    "prune": false,
    "force": false,
    "dryRun": false,
    "nonInteractive": false
  }
}
```

## `nrb doctor`

Run workspace health checks:

```bash
pnpm --filter @repo/tooling tooling doctor
```

### Checks performed

| Check             | Status              | Description                                        |
| ----------------- | ------------------- | -------------------------------------------------- |
| `node-version`    | pass/fail/warn      | Node.js version (>=18 required, >=20 recommended). |
| `pnpm`            | pass/fail           | pnpm availability and version.                     |
| `docker`          | pass/skip           | Docker availability (optional for E2E).            |
| `manifests`       | pass/fail           | `package.json`, `tsconfig.base.json` present.      |
| `lock-file`       | pass/warn           | `pnpm-lock.yaml` present.                          |
| `nx-graph`        | pass/warn           | Nx project graph resolves.                         |
| `nrb-config`      | pass/fail/warn/skip | `nrb.config.json` validity.                        |
| `nrb-state`       | pass/fail/warn/skip | `.nrb/state.json` consistency.                     |
| `tooling-package` | pass/fail/warn      | `@repo/tooling` bin entries.                       |

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

## Recovery

- **Stale state**: delete `.nrb/state.json` and re-run setup.
- **Conflicting files**: use `--force` or manually resolve.
- **Dirty worktree**: the setup engine does not check Git status; use `nrb doctor` to see the overall workspace health.
- **Failed rollback**: the apply engine rolls back on failure. If rollback itself fails, the `rollbackError` message explains what went wrong.

## Next steps

- [Presets and Technologies](presets-and-technologies.md) — full preset matrix and support table.
- [CLI Reference](cli-reference.md) — every command with flags and examples.
- [Troubleshooting](troubleshooting.md) — detailed recovery procedures.
