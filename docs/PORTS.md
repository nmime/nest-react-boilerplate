# Service Port Registry

Generated from `nrb.config.json` by `nrb reconfigure`. Do not edit by hand.

## Application ports

| Service            | Port | Environment             | Role                       |
| ------------------ | ---: | ----------------------- | -------------------------- |
| `admin-app-api`    | 3001 | `ADMIN_APP_API_PORT`    | Backend API (admin)        |
| `user-app-api`     | 3002 | `USER_APP_API_PORT`     | Backend API (user)         |
| `auth-app-api`     | 3003 | `AUTH_APP_API_PORT`     | Backend API (auth)         |
| `discord-app-api`  | 3007 | `DISCORD_APP_API_PORT`  | Backend API (Discord bot)  |
| `telegram-bot-api` | 3013 | `TELEGRAM_BOT_API_PORT` | Backend API (Telegram bot) |
| `admin-app`        | 4200 | `ADMIN_APP_PORT`        | Frontend (admin panel)     |
| `user-app`         | 4201 | `USER_APP_PORT`         | Frontend (user dashboard)  |
| `landing-app`      | 4202 | `LANDING_APP_PORT`      | Frontend (landing page)    |
| `site-app`         | 4203 | `SITE_APP_PORT`         | Frontend (Vike SSR site)   |
| `mobile-app`       | 4300 | `MOBILE_APP_PORT`       | Frontend (Expo mobile/web) |

## Infrastructure ports

| Service         |  Port | Environment          | Role                 |
| --------------- | ----: | -------------------- | -------------------- |
| `postgres`      |  5432 | `POSTGRES_PORT`      | Database             |
| `redis`         |  6379 | `REDIS_PORT`         | Cache / sessions     |
| `mongodb`       | 27017 | `MONGODB_PORT`       | Alternative database |
| `nats`          |  4222 | `NATS_PORT`          | Messaging            |
| `nats-monitor`  |  8222 | `NATS_MONITOR_PORT`  | NATS metrics         |
| `minio`         |  9000 | `MINIO_PORT`         | Object storage       |
| `minio-console` |  9001 | `MINIO_CONSOLE_PORT` | Object storage UI    |
| `edge`          |  8080 | `EDGE_PORT`          | Reverse proxy / edge |

## Observability ports

| Service      | Port | Environment                | Role               |
| ------------ | ---: | -------------------------- | ------------------ |
| `otlp-grpc`  | 4317 | `OTEL_COLLECTOR_GRPC_PORT` | OTLP gRPC          |
| `otlp-http`  | 4318 | `OTEL_COLLECTOR_HTTP_PORT` | OTLP HTTP          |
| `grafana`    | 3000 | `GRAFANA_PORT`             | Grafana UI         |
| `prometheus` | 9090 | `PROMETHEUS_PORT`          | Prometheus metrics |
| `loki`       | 3100 | `LOKI_PORT`                | Loki logs          |
| `tempo`      | 3200 | `TEMPO_PORT`               | Tempo traces       |

## Staging matrix

Staging uses the configured offset **+100**.

| Service            | Staging port | Base port | Role                       |
| ------------------ | -----------: | --------: | -------------------------- |
| `admin-app-api`    |         3101 |      3001 | Backend API (admin)        |
| `user-app-api`     |         3102 |      3002 | Backend API (user)         |
| `auth-app-api`     |         3103 |      3003 | Backend API (auth)         |
| `discord-app-api`  |         3107 |      3007 | Backend API (Discord bot)  |
| `telegram-bot-api` |         3113 |      3013 | Backend API (Telegram bot) |
| `admin-app`        |         4300 |      4200 | Frontend (admin panel)     |
| `user-app`         |         4301 |      4201 | Frontend (user dashboard)  |
| `landing-app`      |         4302 |      4202 | Frontend (landing page)    |
| `site-app`         |         4303 |      4203 | Frontend (Vike SSR site)   |
| `mobile-app`       |         4400 |      4300 | Frontend (Expo mobile/web) |
| `postgres`         |         5532 |      5432 | Database                   |
| `redis`            |         6479 |      6379 | Cache / sessions           |
| `mongodb`          |        27117 |     27017 | Alternative database       |
| `nats`             |         4322 |      4222 | Messaging                  |
| `nats-monitor`     |         8322 |      8222 | NATS metrics               |
| `minio`            |         9100 |      9000 | Object storage             |
| `minio-console`    |         9101 |      9001 | Object storage UI          |
| `otlp-grpc`        |         4417 |      4317 | OTLP gRPC                  |
| `otlp-http`        |         4418 |      4318 | OTLP HTTP                  |
| `edge`             |         8180 |      8080 | Reverse proxy / edge       |
| `grafana`          |         3100 |      3000 | Grafana UI                 |
| `prometheus`       |         9190 |      9090 | Prometheus metrics         |
| `loki`             |         3200 |      3100 | Loki logs                  |
| `tempo`            |         3300 |      3200 | Tempo traces               |

## Container and proxy ports

- Backend and SSR containers listen on `80`.
- SPA nginx containers and the Compose edge listen on `8080`.
- Caddy, nginx, Helm and smoke probes derive their targets from this matrix.
