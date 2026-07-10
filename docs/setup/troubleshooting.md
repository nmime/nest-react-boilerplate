# Troubleshooting

Common issues and recovery procedures for the NRB setup engine, Nx builds, and the monorepo workspace.

## Setup engine issues

### `nrb setup` fails with configuration validation error

```
Configuration validation failed:
  - admin-app: Admin Dashboard requires capability "authz"
```

**Cause**: The selected apps require capabilities that are not enabled.

**Fix**: The setup engine auto-enables required capabilities. If running non-interactively, add the missing capabilities:

```bash
nrb setup --preset fullstack --capability authz --non-interactive
```

Or use a preset that includes all required dependencies.

### `nrb setup` refuses to overwrite existing files

```
Refusing to overwrite existing files or aliases. Re-run with --force if intentional:
- nrb.config.json
```

**Cause**: A tracked file already exists and differs from the planned content.

**Fix**: Review the conflict, then use `--force`:

```bash
nrb setup --force
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
nrb setup --dry-run    # review the plan
nrb setup              # apply
```

### `nrb doctor` shows failed checks

| Check             | Symptom                                                | Fix                                                                         |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `node-version`    | `Node.js v16.x.x — minimum 18.x required`              | `nvm use` or install Node.js >=24.                                          |
| `pnpm`            | `pnpm not found`                                       | `corepack enable && corepack prepare pnpm@11.11.0 --activate`.              |
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
3. Check that PostgreSQL image can pull: `docker pull postgres:16-alpine`.

## Nx build issues

### `nx build` fails with module resolution errors

```
error TS2307: Cannot find module '@app/backend-feature-invoices-main'
```

**Fix**: The path alias was generated but `tsconfig.base.json` wasn't updated correctly. Run:

```bash
nrb add feature invoices --force
```

Or manually add the alias to `tsconfig.base.json`:

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
nrb setup
git stash pop

# Option 2: commit changes first
git add .
git commit -m "WIP: save current state"
nrb setup

# Option 3: force overwrite
nrb setup --force
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
corepack prepare pnpm@11.11.0 --activate
pnpm --version  # should show 11.11.0
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
