# syntax=docker/dockerfile:1

ARG TARGETPLATFORM
ARG TARGETARCH

ARG NODE_VERSION=24.18.0-alpine
ARG PNPM_VERSION=11.15.1

FROM node:${NODE_VERSION} AS workspace
ARG PNPM_VERSION
WORKDIR /workspace
ENV CI=true NX_DAEMON=false
RUN apk add --no-cache libc6-compat libcap python3 make g++ \
  && setcap 'cap_net_bind_service=+ep' "$(which node)" \
  && npm install -g pnpm@${PNPM_VERSION}

# The fetched store is keyed only on the lockfile. The generated manifest tree
# lets the install layer remain independent from workspace source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch
COPY package.json nx.json tsconfig.base.json tsconfig.lint.json eslint.config.js ./
COPY docker/workspace-manifests/ ./
RUN pnpm install --frozen-lockfile --offline \
  && chown -R node:node /workspace

COPY config ./config
COPY apps ./apps
COPY libs ./libs
COPY packages ./packages
COPY i18n ./i18n

# Minimal migration dependency closure. Installing only docker/migrator-package.json
# (MikroORM + pg + the loaders) from the warm offline store keeps the migrator off
# the @repo/tooling CLI's heavy dev/test deps (playwright, nx, sharp, istanbul, ...)
# that otherwise dominate this image's CVE surface.
FROM workspace AS migrator-deps
WORKDIR /migrator
COPY docker/migrator-package.json ./package.json
RUN pnpm install --prod --prefer-offline --ignore-workspace --no-frozen-lockfile --ignore-scripts

FROM node:${NODE_VERSION} AS migrator
ENV CONTAINER=true \
  NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=migrator-deps /migrator/node_modules ./node_modules
# TypeScript sources the migration transpiles on the fly (@swc-node/register +
# tsconfig-paths); source files carry no package CVEs.
COPY packages/tooling ./packages/tooling
COPY libs ./libs
COPY config ./config
COPY i18n ./i18n
COPY tsconfig.base.json ./tsconfig.base.json
COPY docker/migrator-run.mjs ./docker/migrator-run.mjs
COPY --chmod=0555 docker/secret-entrypoint.sh /usr/local/bin/secret-entrypoint
ENTRYPOINT ["/usr/local/bin/secret-entrypoint"]
CMD ["node", "docker/migrator-run.mjs"]

FROM workspace AS builder
ARG NX_BUILD_PROJECTS
ARG NX_PROJECT
ARG VITE_API_BASE_URL_MODE=same-origin
ARG VITE_AUTH_API_BASE_URL
ARG VITE_USER_API_BASE_URL
ARG VITE_ADMIN_API_BASE_URL
ARG VITE_TELEGRAM_AUTH_ENABLED=false
ENV VITE_API_BASE_URL_MODE=${VITE_API_BASE_URL_MODE} \
  VITE_AUTH_API_BASE_URL=${VITE_AUTH_API_BASE_URL} \
  VITE_USER_API_BASE_URL=${VITE_USER_API_BASE_URL} \
  VITE_ADMIN_API_BASE_URL=${VITE_ADMIN_API_BASE_URL} \
  VITE_TELEGRAM_AUTH_ENABLED=${VITE_TELEGRAM_AUTH_ENABLED}
# Backend apps enable generatePackageJson + generateLockfile, so each build emits
# a pruned package.json and pnpm-lock.yaml under its dist output describing only
# the npm packages that app (and the workspace libs it inlines) actually imports.
# Reuse Nx task outputs while BuildKit builds several application targets. The
# cache mount never enters a runtime image and is safe to discard at any time.
RUN --mount=type=cache,target=/workspace/.nx/cache,sharing=locked \
  PROJECTS="${NX_BUILD_PROJECTS:-$NX_PROJECT}" \
  && test -n "${PROJECTS}" \
  && pnpm exec nx run-many -t build export --projects="${PROJECTS}"

# Per-app production dependencies. Installing from the app's generated
# dist package.json + pruned lockfile against the store already populated by
# `pnpm fetch` yields a node_modules that excludes the rest of the workspace
# (React, Tamagui, bot libs, ...). Flags:
#   --prod            production dependencies only
#   --prefer-offline  reuse the pnpm-fetch store first, with registry metadata
#                     fallback for generated per-app lockfiles
#   --frozen-lockfile use the app's generated lockfile without re-resolving its
#                     dependency graph. A copy of pnpm-workspace.yaml supplies the
#                     exact root overrides recorded in that lockfile, including
#                     security overrides for transitive production dependencies.
#   --ignore-scripts  the standalone dir lacks the root `allowBuilds` policy, so pnpm
#                     would fail on unapproved build scripts; backend runtime deps are
#                     pure JS and need none
FROM builder AS backend-deps
ARG BUILD_OUTPUT=dist/apps/backend/admin/admin-app-api
WORKDIR /workspace/${BUILD_OUTPUT}
# Drop esbuild/drizzle-kit: they arrive as dead weight via better-auth's
# drizzle-kit dependency (this app uses MikroORM, not drizzle), are never run at
# runtime, and their bundled Go binaries carry the bulk of the image's CVEs.
# Keep the generated lockfile's root policy active in this otherwise standalone
# install. Without this file pnpm rejects a frozen install; allowing it to
# re-resolve silently discards overrides and can reintroduce fixed CVEs.
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --prod --prefer-offline --frozen-lockfile --ignore-scripts \
  && find node_modules/.pnpm -maxdepth 1 -type d \( -name '@esbuild+*' -o -name 'esbuild@*' -o -name '@esbuild-kit+*' -o -name 'drizzle-kit@*' \) -exec rm -rf {} + \
  && test -d node_modules/.pnpm/find-my-way@9.7.0

FROM node:${NODE_VERSION} AS backend
ENV CONTAINER=true \
  NODE_ENV=production \
  PORT=80
WORKDIR /app
ARG BUILD_OUTPUT=dist/apps/backend/admin/admin-app-api
ENV BUILD_OUTPUT=${BUILD_OUTPUT}
RUN apk add --no-cache libcap su-exec \
  && setcap 'cap_net_bind_service=+ep' "$(which node)" \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
# Placed at /app so both the app and the libs it inlines resolve modules from
# a shared ancestor node_modules.
COPY --from=backend-deps /workspace/${BUILD_OUTPUT}/package.json ./package.json
COPY --from=backend-deps /workspace/${BUILD_OUTPUT}/node_modules ./node_modules
COPY --from=builder /workspace/dist ./dist
COPY --from=builder /workspace/i18n ./i18n
COPY --chmod=0555 docker/secret-entrypoint.sh /usr/local/bin/secret-entrypoint
RUN node -e "require('./dist/libs/backend/common/i18n/libs/backend/common/i18n/lib/src')"
ENTRYPOINT ["/usr/local/bin/secret-entrypoint"]
EXPOSE 80
CMD ["sh", "-c", "node \"$BUILD_OUTPUT\""]

# Vike's build output does not contain an application package or lockfile.
# Deploy the owning workspace project with pnpm so the runtime receives a
# portable, production-only dependency graph derived from the reviewed root
# lockfile and supply-chain policy.
FROM builder AS site-deps
RUN pnpm pm deploy --filter site-app --prod /site-deploy \
  && { find /site-deploy/node_modules/.pnpm -maxdepth 1 -type d \( -name '@esbuild+*' -o -name 'esbuild@*' -o -name '@esbuild-kit+*' -o -name 'drizzle-kit@*' \) -prune -exec rm -rf {} + 2>/dev/null || true; }

FROM node:${NODE_VERSION} AS site-runtime
ENV CONTAINER=true \
  NODE_ENV=production \
  PORT=80
WORKDIR /app
ARG BUILD_OUTPUT=dist/apps/frontend/site
ENV BUILD_OUTPUT=${BUILD_OUTPUT}
RUN apk add --no-cache libcap \
  && setcap 'cap_net_bind_service=+ep' "$(which node)" \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=site-deps /site-deploy/package.json ./package.json
COPY --from=site-deps /site-deploy/node_modules ./node_modules
COPY --from=builder /workspace/dist ./dist
USER node
EXPOSE 80
CMD ["node", "dist/apps/frontend/site/server/index.js"]

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49 AS frontend
ARG FRONTEND_OUTPUT=dist/apps/frontend/admin
ARG NGINX_CONFIG=docker/nginx-fullstack.conf
USER root
RUN apk add --no-cache wget
COPY ${NGINX_CONFIG} /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/${FRONTEND_OUTPUT} /usr/share/nginx/html
# Per-deployment runtime config: the nginx entrypoint runs /docker-entrypoint.d/
# hooks (as uid 101) before starting, so flags come from the container
# environment instead of the Vite build. Only runtime-config.js is made writable
# by the runtime user — the rest of the bundle stays immutable.
COPY docker/frontend-runtime-config.sh /docker-entrypoint.d/40-frontend-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-frontend-runtime-config.sh \
  && touch /usr/share/nginx/html/runtime-config.js \
  && chown 101:101 /usr/share/nginx/html/runtime-config.js
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/nginx-health || exit 1
