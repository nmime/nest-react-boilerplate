# Stage 1: Base Node.js image
FROM registry.xrocket.exchange/xrocket/development/monorepo/node:24.13.0-alpine3.23 AS base

RUN apk add --no-cache jq
RUN corepack enable

USER node
WORKDIR /home/node/wallet
ENV PATH=/home/node/wallet/node_modules/.bin:$PATH

# Stage 2: All dependencies
FROM base AS development_dependencies

COPY --chown=node:node wallet/patches ./patches
COPY --chown=node:node wallet/.npmrc ./
COPY --chown=node:node wallet/pnpm-workspace.yaml ./
COPY --chown=node:node wallet/package.json ./
COPY --chown=node:node wallet/pnpm-lock.yaml ./

# Workspace member package.json
COPY --chown=node:node wallet/libs/frontend/admin/package.json ./libs/frontend/admin/package.json

RUN pnpm install --frozen-lockfile --prefer-offline --filter @app/source --filter @app/frontend-admin

# Stage 3: Development image
FROM development_dependencies AS development

COPY --chown=node:node wallet/nx.json wallet/tsconfig.base.json wallet/eslint.config.js wallet/jest.config.ts wallet/jest.preset.js ./
COPY --chown=node:node wallet/apps/frontend ./apps/frontend
COPY --chown=node:node wallet/libs/shared ./libs/shared
COPY --chown=node:node wallet/libs/frontend ./libs/frontend
COPY --chown=node:node wallet/tools ./tools
COPY --chown=node:node wallet/assets/local ./assets/local
COPY --chown=node:node wallet/i18n ./i18n

# Stage 4: Build
FROM development AS builder

ARG CI
ARG NX_KEY
ARG NXCACHE_MINIO_URL
ARG NXCACHE_MINIO_ACCESS_KEY
ARG NXCACHE_MINIO_SECRET_KEY
ARG NXCACHE_MINIO_BUCKET

ENV NX_KEY=$NX_KEY
ENV AWS_ACCESS_KEY_ID=$NXCACHE_MINIO_ACCESS_KEY
ENV AWS_SECRET_ACCESS_KEY=$NXCACHE_MINIO_SECRET_KEY

RUN jq \
  --arg endpoint "$NXCACHE_MINIO_URL" \
  --arg bucket "$NXCACHE_MINIO_BUCKET" \
  '.s3 = { "region": "us-east-1", "bucket": $bucket, "endpoint": $endpoint, "forcePathStyle": true }' \
  nx.json > nx.tmp && mv nx.tmp nx.json

RUN nx build admin-app --configuration production --verbose

# Stage 5: Production (nginx)
FROM nginx:1.27-alpine AS production

COPY wallet/apps/frontend/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /home/node/wallet/dist/apps/frontend/admin /usr/share/nginx/html

EXPOSE 80
