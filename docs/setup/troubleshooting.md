# Troubleshooting

Common issues and recovery procedures for the NRB setup engine, Nx builds, and the monorepo workspace.

## Setup engine issues

### Setup reports that no applications are selected

```
Configuration error: No applications selected. Run `pnpm nrb setup` interactively or pass --preset, --app, or --config.
```

**Cause**: A fresh non-interactive workspace has no implicit default
application.

**Fix**: Run the selection wizard, choose an exact profile, or select individual
applications:

```bash
pnpm nrb setup
pnpm nrb setup --app landing-app --app auth-app-api --non-interactive
```

After setup, rerun the wizard or use additive flags to extend the selection:

```bash
pnpm nrb setup --app mobile-app --non-interactive
pnpm nrb setup --list
```

### `pnpm nrb setup` fails with configuration validation error

```
Configuration validation failed:
  - admin-app: Admin Dashboard requires capability "authz"
```

**Cause**: The selected apps require capabilities that are not enabled.

**Fix**: The setup engine auto-enables required capabilities. If a hand-authored
configuration is invalid, add the missing capability or select the application
again through the CLI:

```bash
pnpm nrb setup --capability authz --non-interactive
```

Or use a preset that includes all required dependencies.

### `pnpm nrb setup` refuses to overwrite existing files

```
Refusing to overwrite existing files or aliases. Re-run with --force if intentional:
- nrb.config.json
```

**Cause**: A tracked file already exists and differs from the planned content.

**Fix**: Review the conflict, then use `--force`:

```bash
pnpm nrb setup --force
```

Or manually edit the file and delete `.nrb/state.json` to force a fresh plan.

### Stale state after manual file edits

```
  ○ nrb-state            State file is empty or invalid — may need re-setup
```

**Cause**: `.nrb/state.json` is out of sync with actual file content.

**Fix**: Delete state and re-run:

```bash
rm -rf .nrb/state.json
pnpm nrb setup --dry-run    # review the plan
pnpm nrb setup              # apply
```

### `pnpm nrb doctor` shows failed checks

| Check             | Symptom                                                | Fix                                                                         |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `runtime-version` | `Node.js v24.x.x — repository requires >=24 <25`       | `nvm use` or install the latest Node.js 24 release.                         |
| `pnpm`            | `pnpm not found`                                       | `corepack enable && corepack prepare pnpm@11.15.1 --activate`.              |
| `docker`          | `Docker not available`                                 | Install Docker Desktop or Docker Engine. Marked as optional for E2E.        |
| `manifests`       | `Missing: package.json`                                | Check that you're in the workspace root.                                    |
| `lock-file`       | `pnpm-lock.yaml not found`                             | Run `pnpm install`.                                                         |
| `nx-graph`        | `Unable to resolve Nx project graph`                   | Run `pnpm install` and check for TypeScript errors in `project.json` files. |
| `nrb-config`      | `Invalid config: schemaVersion: Invalid literal value` | Update `schemaVersion` to `"1.0.0"` in `nrb.config.json`.                   |
| `tooling-package` | `@repo/tooling missing nrb bin entry`                  | Run `pnpm install` to ensure bins are linked.                               |

## Docker issues

### Docker not starting for `dev:db`

```bash
pnpm run dev:db
```

**Fix**:

1. Ensure Docker daemon is running: `docker info`.
2. Check for port conflicts: `lsof -i :5432` (PostgreSQL default).
3. If containers are stuck: `docker compose down -v` and retry.

### Docker smoke tests fail

```bash
pnpm run test:docker-smoke
```

**Fix**:

1. Check Docker Compose output for service failures.
2. Verify `.env` has correct database credentials.
3. Check that PostgreSQL image can pull: `docker pull postgres:17.6-alpine`.

## Nx build issues

### `nx build` fails with module resolution errors

```
error TS2307: Cannot find module '@app/backend-feature-invoices-main'
```

**Fix**: Do not regenerate the feature. Confirm the owning library path and add
the missing alias to `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@app/backend-feature-invoices-main": ["libs/backend/feature/invoices/main/lib/src/index.ts"]
    }
  }
}
```

### Nx cache causing stale builds

```bash
# Clear the Nx cache:
rm -rf .nx/cache
rm -rf dist

# Rebuild:
nx build admin-app
```

### `nx serve` fails with port already in use

```
Port 4200 is already in use.
```

**Fix**:

```bash
# Find the process using the port:
lsof -i :4200

# Kill it, or use a different port:
nx serve admin-app --port=4210
```

## Git and conflict recovery

### Dirty worktree blocks operations

The setup engine does not check Git status. If you have uncommitted changes that conflict with setup-generated files:

```bash
# Option 1: stash changes
git stash
pnpm nrb setup
git stash pop

# Option 2: commit changes first
git add .
git commit -m "chore: save current state"
pnpm nrb setup

# Option 3: force overwrite
pnpm nrb setup --force
```

### Failed rollback from apply

If the apply engine fails mid-way, it attempts to roll back:

```
Apply failed: 3 applied, 1 failed
Rollback: Could not remove /path/to/file: EBUSY
```

**Fix**:

1. The `rollbackError` message tells which file is locked. Close any process holding it.
2. Manually remove the partially-created file: `rm /path/to/file`.
3. Delete state: `rm .nrb/state.json`.
4. Re-run setup.

### Recovery from failed migration

If `init:project` left the repo in an inconsistent state:

```bash
# Reset to before init:project:
git reset --hard HEAD~1

# Or cherry-pick specific commits if you had other changes:
git log --oneline
git cherry-pick <commit-sha>
```

## pnpm and dependency issues

### `pnpm install` fails with peer dependency conflicts

```bash
# Force resolve:
pnpm install --no-frozen-lockfile

# Or update the lockfile:
pnpm update
```

### Missing `node_modules` after `git clone`

```bash
pnpm install --frozen-lockfile
```

### Corepack not managing pnpm

```bash
corepack enable
corepack prepare pnpm@11.15.1 --activate
pnpm --version  # should show 11.15.1
```

## Environment variable issues

### `VITE_API_BASE_URL` not set in frontend builds

**Fix**: The frontend uses `VITE_API_BASE_URL_MODE=same-origin` by default. For explicit origins:

```bash
VITE_API_BASE_URL=http://localhost:3000 nx build user-app
```

### `OPENAPI_ENABLED` not working

**Fix**: Set in `.env` or as an environment variable when starting the API:

```bash
OPENAPI_ENABLED=true nx serve user-app-api
```

## Next steps

- [Setup and Configuration](configuration.md) — setup engine details.
- [Migration Guide](migration.md) — migrate from legacy scripts.
- [CLI Reference](cli-reference.md) — command flags and examples.
