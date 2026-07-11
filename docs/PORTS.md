# Service Port Registry

Every runnable service in this repository MUST have an explicitly assigned port.
There is no runtime auto-discovery, no implicit framework/default port fallback,
and no random free-port allocation.

## Port Matrix

| Service             | Port | Role                         |
| ------------------- | ---- | ---------------------------- |
| Admin API           | 3001 | Backend API (admin)          |
| User API            | 3002 | Backend API (user)           |
| Auth API            | 3003 | Backend API (auth)           |
| Discord Bot API     | 3007 | Backend API (Discord bot)    |
| Telegram Bot API    | 3013 | Backend API (Telegram bot)   |
| Telegram Bot Worker | 3023 | Background worker (Telegram) |
| Admin App           | 4200 | Frontend (admin panel)       |
| User App            | 4201 | Frontend (user dashboard)    |
| Landing App         | 4202 | Frontend (landing page)      |
| Site App            | 4203 | Frontend (Vike SSR site)     |
| Mobile App          | 4300 | Frontend (Expo mobile/web)   |

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

## Rules

- **No `defaultPort`** — the old optional `defaultPort` field is removed.
- **No `findFreePort` / `defaultPortFactory`** — removed from `port.util.ts`.
- **No container auto-detection fallback** — containers set `PORT=80` explicitly via `ENV PORT=80`.
- **Collision-free** — every port in the matrix is unique; a test validates this.
