# Contributing

Use this guide with the root `README.md`, [Command matrix](docs/command-matrix.md), and the documents in `docs/`.

## Prerequisites

- Node.js `>=26 <27`; use `.nvmrc` for the current local patch version.
- pnpm `11.5.2` through Corepack.
- Docker Compose for PostgreSQL, container builds, smoke tests, and full-stack e2e.

```bash
nvm use
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

## Branch and PR workflow

1. Branch from `main` with a focused name, for example `feature/billing-settings` or `fix/auth-cookie-flags`.
2. Keep commits scoped and explain user-visible behavior in the commit message or PR body.
3. Document any new runtime variable in `.env.example`, relevant environment examples, and `README.md`.
4. Update generated contracts/clients when API shape changes.
5. Do not commit secrets, `.env*` files with real values, Docker secret files, `dist/`, `coverage/`, `.nx/`, Playwright reports, or local database volumes.

## Workspace rules

- Put deployable apps under `apps/**`.
- Keep shared libraries in their current split: `libs/backend/common/**`, `libs/backend/feature/**`, `libs/backend/postgres/**`, `libs/frontend/**`, and the remaining cross-runtime `libs/common/**` set. Root translation catalogs live in `i18n/<locale>/common.json`.
- Use Nx project names in commands.
- Keep cross-project imports on the configured `@app/*` path aliases; use `@app/frontend/feature-admin-shared` and `@app/backend/feature-admin-shared` for admin shared imports.
- Add public developer commands to `package.json` and [Command matrix](docs/command-matrix.md).
- Add local automation under `packages/tooling/src` and expose supported commands through `packages/tooling/bin/repo-tooling.mjs`.

## Required checks before a PR

Run the fast local preflight before every PR:

```bash
pnpm run check:fast
```

Add the targeted checks that match the changed surface area:

```bash
pnpm run db:migrations:check      # database migrations
pnpm run test:coverage            # runtime TypeScript changes
pnpm run test:e2e                 # cross-app behavior changes
pnpm run test:fullstack           # Docker-backed full-stack behavior
pnpm run build                    # build, package, or Docker changes
pnpm run audit                    # dependency changes
```

Run `pnpm run check` for release-risk, security-sensitive, or broad cross-cutting changes before requesting merge.

Coverage thresholds are defined in `config/vitest-coverage.mts`; run `pnpm run test:coverage` for runtime TypeScript changes.

## Backend changes

- Use `@app/common/bootstrap` (`libs/backend/common/bootstrap`) for Nest app startup.
- Preserve Helmet, strict validation, and secure production CORS behavior.
- Keep `GET /health` available for deploy health checks.
- Never log secrets or full environment objects.
- Keep OAuth disabled unless an app explicitly supplies provider configuration and product-specific callback handling.
- Follow [database migration standards](docs/database-migrations.md): explicit `NOT NULL`, `VARCHAR` plus checks instead of enums, and deterministic constraint/index names.

- Run `pnpm run lib:configs:check` after library split/config changes, `pnpm run tooling:static-check` after tooling/script changes, and the API/client/OpenAPI or DB migration checks when those surfaces change.

## Frontend changes

- Reuse `@app/frontend-ui` primitives for shared layout and components; keep Storybook stories/config in `libs/frontend/ui/lib/.storybook` in sync for design-system changes.
- Follow [frontend state architecture](docs/frontend-state.md) for TanStack Query, MobX shell state, theme/i18n ownership, raw-fetch limits, and copy rules.
- Keep static smoke checks, Storybook stories, and user-visible copy assertions in sync when frontend shells change.
- Keep browser-facing API base URLs documented with the matching `VITE_*` variable.

## Deployment and documentation changes

- Keep the root `Dockerfile` aligned with current Nx project names and output paths.
- Keep the root `docker-compose.yml` focused on local PostgreSQL and `docker/docker-compose.yml` focused on the full stack.
- Update Docker, CI, runbook, or troubleshooting docs whenever operational behavior changes.
- Document only behavior that is verified in source or by running the relevant command.
