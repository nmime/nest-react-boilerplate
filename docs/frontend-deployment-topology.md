# Frontend deployment topology

This repository supports two safe frontend/API wiring modes across all six
frontend shapes: the neutral Vite starter, Astro static landing, Vite SPA
admin/user, the Vike SSR site, and the Expo mobile web export. Choose one mode
per environment and keep build-time variables, nginx config, Vike server
routing, ingress paths, and public DNS/CORS values aligned.

## Frontend domain contract

The Helm defaults assign one unique split-host domain to every frontend app.
Replace `example.com` in environment-owned values, but preserve the
one-host-per-app mapping and include every browser origin in `config.corsOrigins`
and TLS:

| Frontend app  | Default host          | Kubernetes service |
| ------------- | --------------------- | ------------------ |
| `landing-app` | `example.com`         | `landing-app`      |
| `starter-app` | `starter.example.com` | `starter-app`      |
| `site-app`    | `site.example.com`    | `site-app`         |
| `user-app`    | `app.example.com`     | `user-app`         |
| `admin-app`   | `admin.example.com`   | `admin-app`        |
| `mobile-app`  | `mobile.example.com`  | `mobile-app`       |

The deployment validator fails when any of these host, service, CORS, or TLS
assignments is missing. DNS records and certificates remain environment/platform
responsibilities; the app chart owns the ingress contract they target.

## Mode 1: same-origin API proxy

Use this when browser and SSR requests should call APIs through the same origin
that serves the frontend. Direct production frontend build targets default to
this mode when neither `VITE_API_BASE_URL_MODE` nor any `VITE_*_API_BASE_URL`
values are configured:

```bash
pnpm exec nx build landing-app
pnpm exec nx build starter-app
pnpm exec nx build site-app
pnpm exec nx build user-app
pnpm exec nx build admin-app
pnpm exec nx run mobile-app:export
```

You may also set the mode explicitly, which is recommended for CI/deployment
pipelines so the intended reverse-proxy topology is visible in logs:

```bash
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build landing-app
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build starter-app
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build site-app
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build user-app
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build admin-app
EXPO_PUBLIC_API_BASE_URL=/ pnpm exec nx run mobile-app:export
```

Docker/Compose uses `docker/nginx-fullstack.conf`. Helm uses the chart-rendered
frontend nginx ConfigMap. Both keep browser-facing API roots empty and proxy the
API prefixes server-side:

- `/auth/*` -> auth API, with `/auth/docs` kept as an API/docs route.
- `/profile/*` -> user API.
- `/admin/*` -> admin API, with `/admin/docs` kept as an API/docs route.

Static frontend navigations are detected as `GET`/`HEAD` requests with
`Accept: text/html`. Those requests fall back to `index.html`, so reloads work
for landing `/`, current user SPA routes such as `/auth`,
`/auth/discord/callback`, `/profile`, `/settings`, `/tma`,
`/telegram-mini-app`, `/link/telegram`, and `/app`, plus admin routes such as
`/admin`, `/admin/dashboard`, `/admin/users`, `/admin/users/:id`,
`/admin/roles`, `/admin/audit`, `/admin/profile`, `/admin/tenants`, and unknown
admin SPA routes. The Expo mobile web export is served by the same nginx
frontend target. `site-app` is not an nginx SPA fallback; it is a Node/Vike SSR
service that serves `dist/apps/frontend/site/client` assets, exposes `/live` and
`/ready`, and renders document HTML through `apps/frontend/site/server`.
Non-HTML API requests continue to proxy to the backend, which prevents frontend
fallbacks from stealing generated-client API calls.

For Helm path-based frontend routing, keep the frontend service paths explicit
and longest-prefix first in the ingress controller behavior. Split-host remains
the default values shape because independent Vite SPA builds emit root-relative
assets. A one-host path-based deployment must ensure its edge routing also sends
each SPA's asset requests to the same frontend service that served that SPA's
`index.html`, or build the frontend with product-owned base-path support before
switching traffic.

## Mode 2: split-host / explicit-origin

Use this when SPAs are static sites on separate hosts and APIs are reached by
absolute public origins. Build with a non-`same-origin` mode and all explicit API
origins:

```bash
VITE_API_BASE_URL_MODE=split-origin \
VITE_AUTH_API_BASE_URL=https://auth.example.com \
VITE_USER_API_BASE_URL=https://api.example.com \
VITE_ADMIN_API_BASE_URL=https://admin-api.example.com \
pnpm exec nx build admin-app
```

For Docker images, pair this mode with `FRONTEND_NGINX_CONFIG=docker/nginx-spa.conf`
and keep the nginx CSP `connect-src` allow-list aligned with the explicit API
origins. For Helm, keep the complete host-oriented mapping above plus the API
origin (`auth.example.com` by default), or set equivalent environment hostnames
in values files.

`site-app` split-host deployments still need a Node SSR host. Static asset
requests should go to the Vike client output, while document requests should be
handled by the Vike/Fastify server.

## Production build defaults and fail-closed cases

Direct production frontend app build targets default to same-origin mode only
when the build environment has no API mode and no explicit API origins. That
out-of-the-box default is safe only for deployments that provide the documented
same-origin nginx/ingress proxy for `/auth/*`, `/profile/*`, and `/admin/*`.

Production frontend builds still fail closed for ambiguous configured states:

- Same-origin mode: set `VITE_API_BASE_URL_MODE=same-origin` and deploy an nginx
  or ingress API proxy for `/auth/*`, `/profile/*`, and `/admin/*`.
- Explicit-origin mode: set all of `VITE_AUTH_API_BASE_URL`,
  `VITE_USER_API_BASE_URL`, and `VITE_ADMIN_API_BASE_URL` to browser-reachable
  origins.

Do not publish default same-origin builds without the proxy in place. For
standalone/static split-origin SPA hosting, set all explicit API origins and use
a non-`same-origin` mode such as `VITE_API_BASE_URL_MODE=split-origin`.

## Validation commands

Run the repository checks before publishing frontend images or changing routing:

```bash
CI=true pnpm install --frozen-lockfile
pnpm run tooling:static-check
pnpm run typecheck
CI=true pnpm exec nx build landing-app --skip-nx-cache
CI=true pnpm exec nx build starter-app --skip-nx-cache
CI=true pnpm exec nx build site-app --skip-nx-cache
CI=true pnpm exec nx build user-app --skip-nx-cache
CI=true pnpm exec nx build admin-app --skip-nx-cache
CI=true pnpm exec nx run mobile-app:export --skip-nx-cache
CI=true VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build landing-app --skip-nx-cache
CI=true VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build starter-app --skip-nx-cache
CI=true VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build site-app --skip-nx-cache
CI=true VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build user-app --skip-nx-cache
CI=true VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build admin-app --skip-nx-cache
CI=true pnpm exec nx run site-app:e2e --skip-nx-cache
pnpm run deploy:validate:docker
pnpm run deploy:validate:helm
pnpm run format:changed
git diff --check
```

If `nginx` or `helm` is unavailable locally, run the closest static validation
above and render/lint on a runner that has those tools before deployment.
