# Contributing

Use this guide with the root `README.md` and the documents in `docs/`.

## Prerequisites

- Node.js 26.x
- pnpm 10.32.1
- Docker, only when testing container images

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Workspace rules

- Put deployable apps under `apps/**`.
- Put shared libraries under `libs/**`.
- Use Nx project names in commands.
- Keep cross-project imports on the configured `@app/*` path aliases.
- Do not commit generated output from `dist/`, `coverage/`, or `.nx/`.

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
pnpm run build                    # build, package, or Docker changes
pnpm run audit                    # dependency changes
```

Run `pnpm run check` for release-risk, security-sensitive, or broad cross-cutting changes before requesting merge.

Coverage gates require 100% branches, functions, lines, and statements for testable app and library source.

## Backend changes

- Use `libs/common/bootstrap` for Nest app startup.
- Preserve Helmet, strict validation, and secure production CORS behavior.
- Keep `GET /health` available for deploy health checks.
- Never log secrets or full environment objects.
- OAuth remains disabled until an app explicitly supplies configuration.
- Follow [database migration standards](docs/database-migrations.md): explicit `NOT NULL`, `VARCHAR` plus checks instead of enums, and deterministic constraint/index names.

## Frontend changes

- Reuse `@app/frontend-ui` primitives for shared layout and components.
- Keep static smoke checks in sync with user-visible copy when frontend shells change.

## Deployment changes

- Keep the root `Dockerfile` aligned with current Nx project names and output paths.
- Keep `docker/docker-compose.yml` optional and limited to services used by current code.
- Document any new runtime variables in `README.md`.
