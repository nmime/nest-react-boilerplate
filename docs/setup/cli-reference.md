# CLI Reference

Complete reference for all `nrb` / `repo-tooling` commands, including flags, examples, and exit codes.

## Invoking the CLI

The tooling package is installed at `packages/tooling`. Use the root script as
the canonical entrypoint:

```bash
# Canonical from the repository root:
pnpm nrb <command>

# Equivalent package-scoped form:
pnpm --filter @repo/tooling tooling <command>

# Direct Node invocation for CLI debugging:
node packages/tooling/bin/repo-tooling.mjs <command>
```

Every example below is directly runnable from the repository root.

## Help

```bash
pnpm nrb --help
pnpm nrb <command> --help
```

## Setup commands

### `init` / `project:init`

Initialize product identity and replace every checked-in example domain.

```bash
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
```

| Flag                  | Type    | Description                                                  |
| --------------------- | ------- | ------------------------------------------------------------ |
| `--name <title>`      | string  | Required product display name.                               |
| `--domain <base>`     | string  | Required DNS base without protocol, port, path, or wildcard. |
| `--package-name <id>` | string  | Root package name; defaults to the product slug.             |
| `--app-slug <id>`     | string  | Product/application slug.                                    |
| `--db-name <name>`    | string  | PostgreSQL database name.                                    |
| `--apex-app <id>`     | string  | Apex owner: `landing-app` (default) or `site-app`.           |
| `--owner <org>`       | string  | Repository/image owner replacing `your-github-org`.          |
| `--dry-run`           | boolean | Print the file plan without writing.                         |
| `--force`             | boolean | Allow a dirty/non-Git workspace and overwrite conflicts.     |
| `--non-interactive`   | boolean | Compatibility flag; required values must still be explicit.  |

The old `pnpm init:project -- ...` root script calls the same implementation.
Run initialization before `pnpm nrb setup`.

### `setup` / `project:setup`

Interactive and non-interactive boilerplate configuration.

```bash
pnpm nrb setup                                # interactive wizard
pnpm nrb setup --preset fullstack             # preset-based, non-interactive
pnpm nrb setup --config nrb.config.json       # config file
pnpm nrb setup --dry-run                      # show plan only
pnpm nrb setup --prune                        # remove stale setup-managed files
pnpm nrb setup --force                        # overwrite conflicts
pnpm nrb setup --list                         # list current/available choices
pnpm nrb setup --json                         # output plan as JSON
pnpm nrb setup --app user-app --capability i18n  # add apps/caps
pnpm nrb setup --app mobile-app --non-interactive # add later, preserving current selection
pnpm nrb setup --remove-app landing-app --non-interactive
pnpm nrb setup --replace --app landing-app --non-interactive
```

| Flag                       | Type    | Description                                                                     |
| -------------------------- | ------- | ------------------------------------------------------------------------------- |
| `--preset <name>`          | string  | Exact profile shortcut: `minimal`, `web`, `fullstack`, `enterprise`, or `bots`. |
| `--config <path>`          | string  | Exact JSON configuration source; cannot be combined with selection flags.       |
| `--app <id>`               | string  | Add an app to the current selection (repeatable).                               |
| `--capability <id>`        | string  | Add a capability to the current selection (repeatable).                         |
| `--remove-app <id>`        | string  | Remove an app unless another selected app requires it.                          |
| `--remove-capability <id>` | string  | Remove a capability unless it remains required.                                 |
| `--replace`                | boolean | Start from an empty selection before applying explicit additions.               |
| `--list`                   | boolean | Show available entries with selection markers, runtime, and template hostname.  |
| `--dry-run`                | boolean | Show plan without modifying files.                                              |
| `--prune`                  | boolean | Remove stale files previously managed by setup.                                 |
| `--force`                  | boolean | Overwrite existing setup-managed files without refusing.                        |
| `--non-interactive`        | boolean | Skip prompts; first run still requires an explicit selection.                   |
| `--json`                   | boolean | Output a plan or `--list` result as JSON.                                       |
| `--help`, `-h`             | boolean | Show usage.                                                                     |

With no selection flags, interactive setup starts from `custom` on first run
and from the current selection on later runs. Scripted additions are additive;
use `--replace` only when intentionally replacing the complete selection.

Exit codes: `0` success, `1` configuration or validation error.

### `doctor` / `project:doctor`

Run workspace health checks.

```bash
pnpm nrb doctor
pnpm nrb doctor --json
```

Exit codes: `0` all checks pass (or skip/warn), `1` any check failed.

### `add`

Add an app, library, or feature to the workspace.

```bash
pnpm nrb add app <name> --kind <frontend|backend> --renderer <renderer> [--port <port>] [--dry-run]
pnpm nrb add lib <name> --kind <frontend|backend|common> --type <type> --description <purpose> [--scope <scope>]
pnpm nrb add feature <name> --api-app <api-name> --frontend-app <app-name> [--dry-run]
```

| Flag                    | Type    | Description                                                              |
| ----------------------- | ------- | ------------------------------------------------------------------------ |
| `--dry-run`             | boolean | Show what would be done.                                                 |
| `--kind <kind>`         | string  | Required app/lib platform.                                               |
| `--renderer <renderer>` | string  | `vite`, `astro`, `vike`, `expo`, `nest-api`, `consumer`, or `scheduler`. |
| `--port <port>`         | number  | Explicit free local port; omitted means first free canonical port.       |
| `--type <type>`         | string  | Semantic library role used for layout and Nx boundaries.                 |
| `--scope <scope>`       | string  | Owning domain scope for a library.                                       |
| `--description <text>`  | string  | Required concrete library responsibility written to its README.          |
| `--api-app <name>`      | string  | Required API application that owns a feature.                            |
| `--frontend-app <name>` | string  | Required frontend application that hosts a feature.                      |
| `--help`, `-h`          | boolean | Show usage.                                                              |
| `--`                    |         | Pass remaining args to the underlying generator.                         |

Examples:

```bash
pnpm nrb add app billing-api --kind backend --renderer nest-api --port 3200
pnpm nrb add app docs --kind frontend --renderer astro
pnpm nrb add lib billing --kind backend --type feature-main --scope billing --description "Owns billing use cases and exposes the Nest feature module to billing APIs."
pnpm nrb add feature invoices --api-app user-app-api --frontend-app user-app --dry-run
```

An application generator writes a workspace package manifest. After generating
an app, run `pnpm install` once to update `pnpm-lock.yaml` and create the new
workspace links; then verify that `pnpm install --frozen-lockfile` is clean. A
library generator uses the owning shared runtime manifest and does not add a
package manifest by default. Never hand-edit the lockfile.

An application generator creates source/Nx/test/README/AGENTS contracts only.
Before calling a deployable complete, follow the selection, environment,
Compose, Docker/Helm, DNS/TLS, observability, contract, and e2e registration
checklist in [Scaffolding and Extension Contract](../scaffolding-and-extension.md).

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

| Command                | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `docker:selected`      | Run Compose for the setup-generated app/capability selection. |
| `docker:smoke`         | Run Docker smoke checks.                                      |
| `docker:fullstack-e2e` | Run Docker fullstack e2e checks.                              |

## Project commands

| Command                                  | Description                                                   |
| ---------------------------------------- | ------------------------------------------------------------- |
| `project:init`                           | Compatibility alias for `nrb init`.                           |
| `project:generate-vertical-slice <name>` | Deprecated adapter to `add feature`.                          |
| `project:check-library-configs`          | Validate Nx library config placement.                         |
| `project:dependency-map`                 | Show dependency ownership and counts across workspace scopes. |

### `project:dependency-map`

```bash
pnpm run deps:map
pnpm run deps:map -- --json
```

The default output is a Markdown map of all pnpm workspace manifests, grouped
by application, library, root, and tooling scope. `--json` emits the same data,
including sorted dependency names, for scripts. The command is read-only and
derives its result from `pnpm-workspace.yaml` and each live `package.json`.

Exit codes: `0` success, `1` invalid arguments or malformed workspace metadata.

### `project:generate-vertical-slice`

```bash
pnpm nrb project:generate-vertical-slice <name> --api-app <api-name> --frontend-app <app-name> [--dry-run]
```

Delegates to `add feature`; it does not maintain a second template engine.
Existing features must be modified in place; regeneration is rejected.

## Frontend commands

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `frontend:fsd:check` | Enforce strict Feature-Sliced Design boundaries. |

## UI commands

| Command                                       | Description                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ui:shadcn:add <component...>`                | Preview an official shadcn import into shared `ui-web`; pass `--apply` after source and dependency review.                                                                                                                                                                                                                                                   |
| `ui:registry:search --source <source>`        | Search the explicit `shadcn`, `magicui`, or `aceternity` namespace without writing files. Supports bounded `--query`, `--type`, `--limit`, and `--offset` options.                                                                                                                                                                                           |
| `ui:registry:add --source <source> <item...>` | Preview approved registry source with `--view` or `--diff`. Reviewed shadcn/Magic UI writes require `--apply` and a confined preflight. Aceternity is non-persistent research preview only: this template never writes or distributes it; every downstream product must make and implement its own licence, dependency, source-ownership, and test decision. |

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

| Command                                 | Description                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `testing:storybook`                     | Run Storybook interaction tests.                                                                    |
| `testing:storybook-visual`              | Check or explicitly update tagged Storybook visual baselines; accepts `--projects` and `--stories`. |
| `testing:frontend-static-smoke`         | Smoke-test a built frontend from static assets.                                                     |
| `testing:frontend-browser-e2e-coverage` | Run browser e2e smoke coverage.                                                                     |

## Specification commands

| Command         | Description                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `spec:validate` | Strict-validate OpenSpec, requirement projects, executable-test markers, evidence, and Cucumber tags. |
| `spec:trace`    | Write exact-SHA project/test/feature/requirement/evidence inventory totals.                           |
| `spec:impact`   | Map a Git revision range to affected requirements, Nx targets, and root scripts.                      |
| `spec:verify`   | Execute one selected evidence lane and write JSON/Markdown assurance dossiers.                        |
| `spec:report`   | Render an existing JSON assurance dossier as Markdown without rerunning evidence.                     |

Use the root aliases shown in [Specification
assurance](../specification-assurance.md). `spec:verify --dry-run` proves
selection only; exact-revision passing evidence requires a clean committed
worktree.

## Tooling commands

| Command                        | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `tooling:static-check`         | TS-first static validation for repo tooling. |
| `tooling:changed-format-check` | Run Prettier on changed files only.          |

## Git commands

| Command              | Description                                                                          |
| -------------------- | ------------------------------------------------------------------------------------ |
| `git:branch-cleanup` | Preview or delete merged branches.                                                   |
| `git:conventions`    | Validate branch naming, Conventional Commits, linear history, and agent attribution. |

## Image commands

| Command       | Description                     |
| ------------- | ------------------------------- |
| `images:webp` | Convert PNG/JPG assets to WebP. |

## Next steps

- [Setup and Configuration](configuration.md) — detailed setup walkthrough.
- [Presets and Technologies](presets-and-technologies.md) — full preset and catalog matrix.
- [Command Matrix](../command-matrix.md) — supported `pnpm run` aliases for CI and local use.
