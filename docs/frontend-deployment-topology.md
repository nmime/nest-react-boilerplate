# Frontend deployment topology

This repository supports two safe frontend/API wiring modes. Choose one per
environment and keep the build-time Vite variables, nginx config, ingress paths,
and public DNS/CORS values aligned.

## Mode 1: same-origin API proxy

Use this when a browser should call APIs through the same origin that serves the
SPA. Build frontend images with:

```bash
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build landing-app
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build user-app
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build admin-app
```

Docker/Compose uses `docker/nginx-fullstack.conf`. Helm uses the chart-rendered
frontend nginx ConfigMap. Both keep browser-facing API roots empty and proxy the
API prefixes server-side:

- `/auth/*` -> auth API, with `/auth/docs` kept as an API/docs route.
- `/profile/*` -> user API.
- `/admin/*` -> admin API, with `/admin/docs` kept as an API/docs route.

SPA navigations are detected as `GET`/`HEAD` requests with `Accept: text/html`.
Those requests fall back to `index.html`, so reloads work for landing `/`, user
routes such as `/auth`, `/auth/discord/callback`, `/profile`, `/settings`,
`/tma`, `/telegram-mini-app`, `/link/telegram`, and `/app`, plus admin routes
such as `/admin`, `/admin/dashboard`, `/admin/users`, `/admin/users/:id`,
`/admin/roles`, `/admin/audit`, `/admin/profile`, `/admin/tenants`, and unknown
admin SPA routes. Non-HTML API requests continue to proxy to the backend, which
prevents SPA fallbacks from stealing generated-client API calls.

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
origins. For Helm, keep the default host-oriented values (`example.com`,
`app.example.com`, `admin.example.com`, and `auth.example.com`) or set equivalent
environment hostnames in values files.

## Fail-closed production builds

Production frontend builds intentionally fail when neither mode is explicit:

- Same-origin mode: set `VITE_API_BASE_URL_MODE=same-origin` and deploy an nginx
  or ingress API proxy for `/auth/*`, `/profile/*`, and `/admin/*`.
- Explicit-origin mode: set all of `VITE_AUTH_API_BASE_URL`,
  `VITE_USER_API_BASE_URL`, and `VITE_ADMIN_API_BASE_URL` to browser-reachable
  origins.

Do not weaken this behavior with empty production API roots unless a same-origin
proxy is intentionally configured.

## Validation commands

Run the repository checks before publishing frontend images or changing routing:

```bash
CI=true pnpm install --frozen-lockfile
pnpm run tooling:static-check
pnpm run typecheck
CI=true VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build landing-app --skip-nx-cache
CI=true VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build user-app --skip-nx-cache
CI=true VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build admin-app --skip-nx-cache
pnpm run deploy:validate:docker
pnpm run deploy:validate:helm
pnpm run format:changed
git diff --check
```

If `nginx` or `helm` is unavailable locally, run the closest static validation
above and render/lint on a runner that has those tools before deployment.
