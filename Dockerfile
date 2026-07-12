# syntax=docker/dockerfile:1

ARG TARGETPLATFORM
ARG TARGETARCH

ARG NODE_VERSION=24.11.0-alpine
ARG PNPM_VERSION=11.11.0

FROM node:${NODE_VERSION} AS workspace
ARG PNPM_VERSION
WORKDIR /workspace
ENV CI=true NX_DAEMON=false
RUN apk add --no-cache libc6-compat libcap python3 make g++ \
  && setcap 'cap_net_bind_service=+ep' "$(which node)" \
  && npm install -g pnpm@${PNPM_VERSION}

# Dependency layer keyed only on the lockfile: pnpm fetch needs no package.json
# manifests, so new workspace projects never require Dockerfile changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch
COPY package.json nx.json tsconfig.base.json tsconfig.lint.json eslint.config.js ./
COPY config ./config
COPY apps ./apps
COPY libs ./libs
COPY packages ./packages
COPY i18n ./i18n
RUN pnpm install --frozen-lockfile --offline \
  && chown -R node:node /workspace

FROM workspace AS migrator
USER node
CMD ["pnpm", "db:migrate"]

FROM workspace AS builder
ARG NX_PROJECT
ARG NX_TARGET=build
ARG VITE_API_BASE_URL_MODE=same-origin
ARG VITE_AUTH_API_BASE_URL
ARG VITE_USER_API_BASE_URL
ARG VITE_ADMIN_API_BASE_URL
ENV VITE_API_BASE_URL_MODE=${VITE_API_BASE_URL_MODE} \
  VITE_AUTH_API_BASE_URL=${VITE_AUTH_API_BASE_URL} \
  VITE_USER_API_BASE_URL=${VITE_USER_API_BASE_URL} \
  VITE_ADMIN_API_BASE_URL=${VITE_ADMIN_API_BASE_URL}
# Backend apps enable generatePackageJson + generateLockfile, so each build emits
# a pruned package.json and pnpm-lock.yaml under its dist output describing only
# the npm packages that app (and the workspace libs it inlines) actually imports.
RUN test -n "${NX_PROJECT}" \
  && pnpm exec nx run "${NX_PROJECT}:${NX_TARGET}"

# Per-app production dependencies. Installing from the app's generated
# dist package.json + pruned lockfile against the store already populated by
# `pnpm fetch` yields a node_modules that excludes the rest of the workspace
# (React, Tamagui, bot libs, ...). Flags:
#   --prod            production dependencies only
#   --prefer-offline  reuse the pnpm-fetch store first, with registry metadata
#                     fallback for generated per-app lockfiles
#   --ignore-workspace treat the dist output as a standalone project so pnpm
#                     uses the app's generated lockfile, not the root workspace one
#   --no-frozen-lockfile the workspace stage sets CI=true (frozen by default) and
#                     the generated lockfile carries the root `overrides` block the
#                     standalone dir cannot reproduce; the offline store is pinned to
#                     the locked versions, so resolution stays deterministic
#   --ignore-scripts  the standalone dir lacks the root `allowBuilds` policy, so pnpm
#                     would fail on unapproved build scripts; backend runtime deps are
#                     pure JS and need none
FROM builder AS backend-deps
ARG BUILD_OUTPUT=dist/apps/backend/admin/admin-app-api
WORKDIR /workspace/${BUILD_OUTPUT}
RUN pnpm install --prod --prefer-offline --ignore-workspace --no-frozen-lockfile --ignore-scripts

FROM node:${NODE_VERSION} AS backend
ENV CONTAINER=true \
  NODE_ENV=production \
  PORT=80
WORKDIR /app
ARG BUILD_OUTPUT=dist/apps/backend/admin/admin-app-api
ENV BUILD_OUTPUT=${BUILD_OUTPUT}
RUN apk add --no-cache libcap \
  && setcap 'cap_net_bind_service=+ep' "$(which node)"
# Placed at /app so both the app and the libs it inlines resolve modules from
# a shared ancestor node_modules.
COPY --from=backend-deps /workspace/${BUILD_OUTPUT}/package.json ./package.json
COPY --from=backend-deps /workspace/${BUILD_OUTPUT}/node_modules ./node_modules
COPY --from=builder /workspace/dist ./dist
COPY --from=builder /workspace/i18n ./i18n
RUN node -e "require('./dist/libs/common/i18n')"
USER node
EXPOSE 80
CMD ["sh", "-c", "node \"$BUILD_OUTPUT\""]

FROM builder AS site-deps
ARG BUILD_OUTPUT=dist/apps/frontend/site
WORKDIR /workspace/${BUILD_OUTPUT}
RUN pnpm install --prod --prefer-offline --ignore-workspace --no-frozen-lockfile --ignore-scripts

FROM node:${NODE_VERSION} AS site-runtime
ENV CONTAINER=true \
  NODE_ENV=production \
  PORT=80
WORKDIR /app
ARG BUILD_OUTPUT=dist/apps/frontend/site
ENV BUILD_OUTPUT=${BUILD_OUTPUT}
RUN apk add --no-cache libcap \
  && setcap 'cap_net_bind_service=+ep' "$(which node)"
COPY --from=site-deps /workspace/${BUILD_OUTPUT}/package.json ./package.json
COPY --from=site-deps /workspace/${BUILD_OUTPUT}/node_modules ./node_modules
COPY --from=builder /workspace/dist ./dist
USER node
EXPOSE 80
CMD ["node", "dist/apps/frontend/site/server/index.js"]

FROM nginxinc/nginx-unprivileged:1.31.2-alpine AS frontend
ARG FRONTEND_OUTPUT=dist/apps/frontend/admin
ARG NGINX_CONFIG=docker/nginx-fullstack.conf
USER root
RUN apk add --no-cache wget
COPY ${NGINX_CONFIG} /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/${FRONTEND_OUTPUT} /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
