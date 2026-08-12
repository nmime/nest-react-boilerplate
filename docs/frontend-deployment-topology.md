# Frontend deployment topology

This repository supports two safe frontend/API wiring modes across all five
frontend shapes: Astro static landing, Vite SPA admin/user, the Vike SSR site,
and the Expo mobile web export. Choose one mode
per environment and keep build-time variables, nginx config, Vike server
routing, ingress paths, and public DNS/CORS values aligned.

Better Auth has an additional cookie-host invariant. In same-origin mode set
`BETTER_AUTH_URL` to the public `user-app` origin and register provider callbacks
under that origin's `/api/auth/*` proxy. In split-origin mode set both
`BETTER_AUTH_URL` and `VITE_AUTH_API_BASE_URL` to the public `auth-app-api`
origin. Never start on one of those hosts and receive/project the session on the
other.

## Public domain contract

The Helm defaults and Compose `per-app-domains` mode assign one unique host to
every production frontend and enabled public API. Replace `example.com` in
environment-owned values, preserve the one-host-per-app mapping, and include
every browser origin in CORS, Better Auth trusted origins, and TLS:

The generated [Project Catalog](project-catalog.md) is the hostname registry.
Each enabled host routes to the identically named Kubernetes/Compose service.
Reference frontends and core APIs are enabled by their selection; Discord and
Telegram APIs remain opt-in integrations.

The Discord and Telegram APIs are disabled until their provider credentials,
callback registration, ingress route, DNS, and TLS host are configured together.
The deployment validator fails when any enabled frontend or core API host,
service, or TLS assignment is missing. DNS records and certificates remain
environment/platform responsibilities; the app chart owns the ingress contract
they target.

Compose derives the catalog mapping from `PUBLIC_DOMAIN` and `PRIMARY_APP`; only
`landing-app` or `site-app` may own the apex. A wildcard DNS record may point
all subdomains to the Compose host, but Caddy still matches only these exact app
IDs. `single-domain` is a separate reduced publishing mode: it exposes the
selected apex frontend plus same-origin API paths and leaves the other
frontends loopback-only. It does not pretend that five root-relative frontend
asset trees can safely share invented URL prefixes. See
[docker-compose-production.md](docker-compose-production.md).

## Mode 1: same-origin API proxy

Use this when browser and SSR requests should call APIs through the same origin
that serves the frontend. Direct production frontend build targets default to
this mode when neither `VITE_API_BASE_URL_MODE` nor any `VITE_*_API_BASE_URL`
values are configured:

```bash
pnpm exec nx build landing-app
pnpm exec nx build site-app
pnpm exec nx build user-app
pnpm exec nx build admin-app
pnpm exec nx run mobile-app:export
```

You may also set the mode explicitly, which is recommended for CI/deployment
pipelines so the intended reverse-proxy topology is visible in logs:

```bash
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build landing-app
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build site-app
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build user-app
VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build admin-app
EXPO_PUBLIC_API_BASE_URL=/ pnpm exec nx run mobile-app:export
```

Leave all `VITE_*_API_BASE_URL` values empty in this mode. Frontend build setup
removes stale explicit origins when `same-origin` is selected, and the production
Compose wrapper also clears them before passing build arguments to Docker.

Docker/Compose uses `docker/nginx-fullstack.conf`, with the Compose Caddy edge
enforcing the same API matching before the request reaches a frontend. Helm
uses the chart-rendered frontend nginx ConfigMap. Both keep browser-facing API
roots empty and proxy the API prefixes server-side:

- `/api/auth/*` -> Better Auth endpoints on the auth API.
- `/auth/*` -> tenant/RBAC auth API, with `/auth/docs` kept as an API/docs route.
- `/profile/*` -> user API.
- `/admin/*` -> admin API, with `/admin/docs` kept as an API/docs route.

Static frontend navigations are detected as `GET`/`HEAD` requests with
`Accept: text/html`. Those requests fall back to `index.html`, so reloads work
for landing `/`, current user SPA routes such as `/auth`,
`/auth/telegram/callback`, `/auth/discord/callback`, `/profile`, `/settings`, `/tma`,
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
VITE_AUTH_API_BASE_URL=https://auth-app-api.example.com \
VITE_USER_API_BASE_URL=https://user-app-api.example.com \
VITE_ADMIN_API_BASE_URL=https://admin-app-api.example.com \
pnpm exec nx build admin-app
```

For Docker images, pair this mode with `FRONTEND_NGINX_CONFIG=docker/nginx-spa.conf`
and keep the nginx CSP `connect-src` allow-list aligned with the explicit API
origins. For Helm, keep the complete host-oriented frontend and API mapping
above, or set equivalent environment hostnames in values files.

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
  or ingress API proxy for `/api/auth/*`, `/auth/*`, `/profile/*`, and `/admin/*`.
- Explicit-origin mode: set all of `VITE_AUTH_API_BASE_URL`,
  `VITE_USER_API_BASE_URL`, and `VITE_ADMIN_API_BASE_URL` to browser-reachable
  origins.

Do not publish default same-origin builds without the proxy in place. For
standalone/static split-origin SPA hosting, set all explicit API origins and use
a non-`same-origin` mode such as `VITE_API_BASE_URL_MODE=split-origin`.

## Runtime browser config (one image, many environments)

API origins are resolved at build time, but browser-safe **feature flags and
landing application destinations are resolved at runtime**, so deployment
topology changes never require rebuilding an SPA image. Each frontend container
runs `docker/frontend-runtime-config.sh` from the nginx
`/docker-entrypoint.d/` hook before serving, rendering the environment into
`/runtime-config.js`:

```js
window.__APP_RUNTIME_CONFIG__ = {
  telegramAuthEnabled: true,
  userAppUrl: 'https://user-app.product.example',
  adminAppUrl: 'https://admin-app.product.example',
};
```

`index.html` loads that file before the app bundle, so
`resolveFeatureFlag(runtimeValue, buildValue)` (from `@app/frontend-api-support`)
reads it synchronously. Precedence is runtime → Vite build value → `false`, and an
unset or unparsable runtime value falls through, so a deployment can only override
a flag deliberately.

| Surface        | How to set it                                                         |
| -------------- | --------------------------------------------------------------------- |
| Compose (prod) | `AUTH_TELEGRAM_ENABLED` / `DISCORD_AUTH_ENABLED` in `.env.production` |
| Kubernetes     | `frontendRuntimeConfig.TELEGRAM_AUTH_ENABLED: 'true'` in Helm values  |
| Local dev      | `VITE_TELEGRAM_AUTH_ENABLED` (build-time default)                     |

### Product identity

Title, icon, and theme colour resolve from the same two-layer configuration, so
renaming the product is never a source sweep. `VITE_PRODUCT_NAME`,
`VITE_PRODUCT_ICON_HREF`, `VITE_PRODUCT_ICON_TYPE`, and
`VITE_PRODUCT_THEME_COLOR` set the identity baked into an image; the matching
`PRODUCT_*` container variables override it per deployment. Both are read by
`resolveProductBrand` in `@app/frontend-api-support`, which every SPA entry point
applies to the live document and the Vite build applies to the shipped
`index.html` — so the tab shows the product's name before the bundle executes.
An unset value falls through to the build default and then to the boilerplate
identity, and the container generator drops a `PRODUCT_*` value that is not a
plain string, a public icon URL/path, an `image/*` media type, or a
`#rgb`/`#rrggbb` colour.

An embedding host paints its own chrome around the app — the Telegram mini app
supplies the header, background, and bottom bar — and that chrome is outside the
document, so neither the stylesheet nor the branding passes above reach it.
`VITE_PRODUCT_CHROME_HEADER_COLOR`, `VITE_PRODUCT_CHROME_BACKGROUND_COLOR`, and
`VITE_PRODUCT_CHROME_BOTTOM_BAR_COLOR` (with the matching `PRODUCT_CHROME_*`
container variables) carry it, defaulting to the design tokens the user app used
to read directly, so an untouched checkout is unchanged and a rebrand no longer
stops at the browser tab.

The `<title>`, `theme-color`, and icon tags each app's `index.html` ships are
pre-hydration defaults for that surface, not product identity; both branding
passes replace them.

Compose derives landing destinations from `PUBLIC_DOMAIN` and the declared
public mode: `per-app-domains` uses the user/admin HTTPS origins, while
`single-domain` uses same-origin `/app` and `/admin` paths. Helm derives the same
contract from each enabled `ingress.hosts` service entry: a separate host becomes
an HTTPS URL and a service sharing the landing host must use a non-root path.
Neither deployment path bakes an environment hostname into the image.

The startup generator and landing consumer accept same-origin paths or
credential-free HTTPS URLs without query strings or fragments. Exact
`localhost` and `127.0.0.1` HTTP origins are also accepted for the local
multi-port fullstack lane when its managed Compose environment explicitly opts
in; the browser consumer also requires the landing page itself to use a loopback
HTTP origin. Arbitrary cleartext origins remain rejected. Invalid or absent
values are omitted and the landing app keeps its local `/app` and `/admin`
fallback. `/runtime-config.js` remains same-origin and is served
`no-store` (an exact-match nginx location that outranks the year-long immutable
rule for hashed assets). The file is public - **never put secrets in it**.

Astro emits a hash-based meta CSP for the landing island's inline hydration
bootstrap. Docker and static-host Nginx admit inline scripts only for the landing
artifact containing that generated hash policy; browsers enforce both policies
together, so scripts without an Astro-generated hash remain blocked. Other
frontend images retain the strict outer `script-src 'self'` policy.

## Validation commands

Run the repository checks before publishing frontend images or changing routing:

```bash
CI=true pnpm install --frozen-lockfile
pnpm run tooling:static-check
pnpm run typecheck
CI=true pnpm exec nx build landing-app --skip-nx-cache
CI=true pnpm exec nx build site-app --skip-nx-cache
CI=true pnpm exec nx build user-app --skip-nx-cache
CI=true pnpm exec nx build admin-app --skip-nx-cache
CI=true pnpm exec nx run mobile-app:export --skip-nx-cache
CI=true VITE_API_BASE_URL_MODE=same-origin pnpm exec nx build landing-app --skip-nx-cache
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
