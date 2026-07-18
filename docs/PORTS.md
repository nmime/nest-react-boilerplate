# Service Port Registry

Every runnable service in this repository MUST have an explicitly assigned port.
There is no runtime auto-discovery, no implicit framework/default port fallback,
and no random free-port allocation.

Application identity, runtime, root, and hostname belong to the
[Project Catalog](project-catalog.md); this file owns only port assignments.

## Port Matrix

| Service            | Port | Role                       |
| ------------------ | ---- | -------------------------- |
| `admin-app-api`    | 3001 | Backend API (admin)        |
| `user-app-api`     | 3002 | Backend API (user)         |
| `auth-app-api`     | 3003 | Backend API (auth)         |
| `discord-app-api`  | 3007 | Backend API (Discord bot)  |
| `telegram-bot-api` | 3013 | Backend API (Telegram bot) |
| `admin-app`        | 4200 | Frontend (admin panel)     |
| `user-app`         | 4201 | Frontend (user dashboard)  |
| `landing-app`      | 4202 | Frontend (landing page)    |
| `site-app`         | 4203 | Frontend (Vike SSR site)   |
| `mobile-app`       | 4300 | Frontend (Expo mobile/web) |

## Infrastructure Services

| Service       | Port(s) | Role              |
| ------------- | ------- | ----------------- |
| PostgreSQL    | 5432    | Database          |
| Redis         | 6379    | Cache / sessions  |
| NATS          | 4222    | Messaging         |
| NATS Monitor  | 8222    | NATS metrics      |
| MinIO         | 9000    | Object storage    |
| MinIO Console | 9001    | Object storage UI |

## How Ports Are Assigned

1. **Application code** — each `main.ts` passes an explicit `port` option:

   ```ts
   bootstrapNestApi(MyModule, { appName: 'my-app', port: 3001 });
   ```

2. **Environment override** — set `MY_APP_PORT` or `PORT` to override at runtime.

3. **Docker/Compose** — the Dockerfile sets `ENV PORT=80` for containerized services;
   docker-compose.yml maps explicit host ports (e.g. `published: '${ADMIN_APP_API_PORT:-3001}'`).

## Staging

Staging services use port offset +100 from production defaults:

| Service            | Staging Port | Production Port | Role                       |
| ------------------ | ------------ | --------------- | -------------------------- |
| `admin-app-api`    | 3101         | 3001            | Backend API (admin)        |
| `user-app-api`     | 3102         | 3002            | Backend API (user)         |
| `auth-app-api`     | 3103         | 3003            | Backend API (auth)         |
| `discord-app-api`  | 3107         | 3007            | Backend API (Discord bot)  |
| `telegram-bot-api` | 3113         | 3013            | Backend API (Telegram bot) |
| `admin-app`        | 4300         | 4200            | Frontend (admin panel)     |
| `user-app`         | 4301         | 4201            | Frontend (user dashboard)  |
| `landing-app`      | 4302         | 4202            | Frontend (landing page)    |
| `site-app`         | 4303         | 4203            | Frontend (Vike SSR site)   |
| `mobile-app`       | 4400         | 4300            | Frontend (Expo mobile/web) |

Configure via `PORT` env var per service, or use `.env.staging` which sets the
staging-specific `*_APP_API_PORT` / `*_APP_PORT` values.

Infrastructure services (PostgreSQL, Redis, NATS, MinIO) use the same ports in
staging; isolate them via separate Docker networks or Kubernetes namespaces.

## Rules

- **No `defaultPort`** — the old optional `defaultPort` field is removed.
- **No `findFreePort` / `defaultPortFactory`** — removed from `port.util.ts`.
- **No container auto-detection fallback** — containers set `PORT=80` explicitly via `ENV PORT=80`.
- **Collision-free** — every port in the matrix is unique; a test validates this.
