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

```bash
pnpm run format:check
pnpm exec nx run-many -t lint --all
pnpm exec nx run-many -t typecheck --all
pnpm run test:coverage
pnpm exec nx run-many -t e2e --projects=admin-app,user-app,landing-app
pnpm exec nx run-many -t build --all
pnpm run audit
```

Coverage gates require 100% branches, functions, lines, and statements for testable app and library source.

## Backend changes

- Use `libs/common/bootstrap` for Nest app startup.
- Preserve Helmet, strict validation, and secure production CORS behavior.
- Keep `GET /health` available for deploy health checks.
- Never log secrets or full environment objects.
- OAuth remains disabled until an app explicitly supplies configuration.

## Frontend changes

- Reuse `@app/frontend-ui` primitives for shared layout and components.
- Keep static smoke checks in sync with user-visible copy when frontend shells change.

## Deployment changes

- Keep the root `Dockerfile` aligned with current Nx project names and output paths.
- Keep `docker/docker-compose.yml` optional and limited to services used by current code.
- Document any new runtime variables in `README.md`.
