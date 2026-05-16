# Deployment and local stack readiness

## Local development flow

```bash
cp .env.example .env
pnpm run dev:db
pnpm run db:migrate
pnpm run dev:fullstack
```

`dev:fullstack` starts the root Postgres compose service, applies SQL migrations from
`libs/postgres/main/auth/migrations`, and runs the three backend APIs plus the
three Vite frontends with local API base URL defaults.

## Database migrations and reset

```bash
pnpm run db:migrate
pnpm run db:reset
```

`db:migrate` reads `DATABASE_URL` or constructs a local URL from `POSTGRES_*`
defaults. `db:reset` drops only the local/dev `auth_users` table and then runs
migrations; it refuses non-local or non-dev-looking database names.

## Docker fullstack

```bash
pnpm run docker:fullstack
pnpm run test:docker-smoke
pnpm run docker:down
```

`docker/docker-compose.yml` includes Postgres health checks, a migration service,
backend `/health` checks, frontend nginx health checks, restart policies, and
healthy dependency ordering. Frontend containers use nginx same-origin API proxying:

- `/auth/*` -> `auth-app-api:3000`
- `/profile/*` -> `user-app-api:3000`
- `/admin/*` -> `backend-admin-app-api:3000`

This lets Docker browser calls use empty Vite API base URLs without localhost
hacks. Production secrets should be supplied from a secret manager; repository
values are placeholders only.
