# CLI Reference

Complete reference for all `nrb` / `repo-tooling` commands, including flags, examples, and exit codes.

## Invoking the CLI

The tooling package is installed at `packages/tooling`. Invoke it in three ways:

```bash
# Short form (via pnpm filter):
pnpm --filter @repo/tooling tooling <command>

# Direct node invocation:
node packages/tooling/bin/repo-tooling.mjs <command>

# Via nrb bin (if registered in PATH):
nrb <command>
```

All examples below use `pnpm --filter @repo/tooling tooling` (aliased as `tooling` in the examples).

## Help

```bash
tooling --help
tooling <command> --help
```

## Setup commands

### `setup` / `project:setup`

Interactive and non-interactive boilerplate configuration.

```bash
tooling setup                                # interactive wizard
tooling setup --preset fullstack             # preset-based, non-interactive
tooling setup --config nrb.config.json       # config file
tooling setup --dry-run                      # show plan only
tooling setup --prune                        # remove orphaned files
tooling setup --force                        # overwrite conflicts
tooling setup --non-interactive              # CI mode with defaults
tooling setup --json                         # output plan as JSON
tooling setup --app user-app --capability i18n  # explicit apps/caps
```

| Flag                | Type    | Description                                                         |
| ------------------- | ------- | ------------------------------------------------------------------- |
| `--preset <name>`   | string  | Preset ID: `minimal`, `starter`, `fullstack`, `enterprise`, `bots`. |
| `--config <path>`   | string  | Path to JSON config file.                                           |
| `--app <id>`        | string  | App ID to enable (repeatable).                                      |
| `--capability <id>` | string  | Capability ID to enable (repeatable).                               |
| `--dry-run`         | boolean | Show plan without modifying files.                                  |
| `--prune`           | boolean | Remove files no longer needed.                                      |
| `--force`           | boolean | Overwrite existing files without refusing.                          |
| `--non-interactive` | boolean | CI mode; skips prompts, uses defaults.                              |
| `--json`            | boolean | Output plan as JSON.                                                |
| `--help`, `-h`      | boolean | Show usage.                                                         |

Exit codes: `0` success, `1` configuration or validation error.

### `doctor` / `project:doctor`

Run workspace health checks.

```bash
tooling doctor
tooling doctor --json
```

Exit codes: `0` all checks pass (or skip/warn), `1` any check failed.

### `add`

Add an app, library, or feature to the workspace.

```bash
tooling add app <name> [--dry-run] [--force] [-- ...extra-args]
tooling add lib <name> [--dry-run] [--force] [-- ...extra-args]
tooling add feature <name> [--dry-run] [--force] [--api-app <api-name>]
```

| Flag               | Type    | Description                                            |
| ------------------ | ------- | ------------------------------------------------------ |
| `--dry-run`        | boolean | Show what would be done.                               |
| `--force`          | boolean | Overwrite existing files.                              |
| `--api-app <name>` | string  | Target API app for features (default: `user-app-api`). |
| `--help`, `-h`     | boolean | Show usage.                                            |
| `--`               |         | Pass remaining args to the underlying generator.       |

Exit codes: `0` success, `1` missing args or unknown kind.

## Database commands

| Command                        | Description                                            |
| ------------------------------ | ------------------------------------------------------ |
| `db:migrate`                   | Run database migrations.                               |
| `db:migrations:check`          | Check migration naming and drift.                      |
| `db:migrations:rollback-check` | Run migrations up/down/up against disposable Postgres. |
| `db:reset`                     | Reset the local database.                              |
| `db:seed`                      | Seed the local database.                               |
| `db:backup`                    | Create a PostgreSQL backup.                            |
| `db:restore`                   | Restore a PostgreSQL backup.                           |
| `db:restore-drill`             | Run backup/restore drill or CI-safe dry-run.           |

## API commands

| Command                     | Description                             |
| --------------------------- | --------------------------------------- |
| `api:openapi`               | Export OpenAPI contracts.               |
| `api:clients`               | Generate frontend API clients.          |
| `api:contracts`             | Generate shared contract review types.  |
| `api:clients:check`         | Check generated API clients.            |
| `api:contracts:check`       | Check generated API contracts.          |
| `api:toast-config:generate` | Generate app-local API toast rule JSON. |
| `api:toast-config:check`    | Validate app-local API toast rule JSON. |

## Development commands

| Command         | Description                         |
| --------------- | ----------------------------------- |
| `dev:fullstack` | Run the local fullstack dev helper. |

## Docker commands

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| `docker:smoke`         | Run Docker smoke checks.         |
| `docker:fullstack-e2e` | Run Docker fullstack e2e checks. |

## Project commands

| Command                                  | Description                           |
| ---------------------------------------- | ------------------------------------- |
| `project:init`                           | Initialize project placeholders.      |
| `project:generate-vertical-slice <name>` | Scaffold a vertical feature slice.    |
| `project:check-library-configs`          | Validate Nx library config placement. |

### `project:generate-vertical-slice`

```bash
tooling project:generate-vertical-slice <name> [--dry-run] [--force] [--api-app <name>]
```

Scaffolds backend DTOs, Nest module, controller, service, PostgreSQL entity, frontend API client stub, and React page stub. Updates `tsconfig.base.json` path aliases.

## Frontend commands

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `frontend:fsd:check` | Enforce strict Feature-Sliced Design boundaries. |

## QA commands

| Command                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `qa:mutation`           | Run Stryker mutation testing or dry-run report. |
| `qa:consumer-contracts` | Validate consumer contracts.                    |
| `qa:openapi-lint`       | Lint OpenAPI contracts.                         |
| `qa:openapi-fuzz`       | Generate OpenAPI fuzz cases.                    |
| `qa:accessibility`      | Run accessibility checks.                       |
| `qa:cross-browser-e2e`  | Run cross-browser e2e matrix.                   |
| `qa:performance`        | Run performance checks.                         |
| `qa:property`           | Run property-based checks.                      |
| `qa:secret-scan`        | Run secret scanning checks.                     |
| `qa:security-sast`      | Run SAST checks.                                |
| `qa:security-dast`      | Run DAST checks.                                |
| `qa:security-suite`     | Run the security suite.                         |
| `qa:world-class-gates`  | Run world-class quality gates.                  |

## Testing commands

| Command                                 | Description                                     |
| --------------------------------------- | ----------------------------------------------- |
| `testing:storybook`                     | Run Storybook interaction tests.                |
| `testing:storybook-visual`              | Run Storybook visual regression tests.          |
| `testing:frontend-static-smoke`         | Smoke-test a built frontend from static assets. |
| `testing:frontend-browser-e2e-coverage` | Run browser e2e smoke coverage.                 |

## Tooling commands

| Command                        | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `tooling:static-check`         | TS-first static validation for repo tooling. |
| `tooling:changed-format-check` | Run Prettier on changed files only.          |

## Git commands

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `git:branch-cleanup` | Preview or delete merged branches. |

## Image commands

| Command       | Description                     |
| ------------- | ------------------------------- |
| `images:webp` | Convert PNG/JPG assets to WebP. |

## Next steps

- [Setup and Configuration](configuration.md) — detailed setup walkthrough.
- [Presets and Technologies](presets-and-technologies.md) — full preset and catalog matrix.
- [Command Matrix](../command-matrix.md) — supported `pnpm run` aliases for CI and local use.
