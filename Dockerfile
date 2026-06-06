# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.1.0-alpine
ARG PNPM_VERSION=10.32.1

FROM node:${NODE_VERSION} AS workspace
ARG PNPM_VERSION
WORKDIR /workspace
ENV CI=true NX_DAEMON=false
RUN apk add --no-cache libc6-compat python3 make g++ \
  && npm install -g pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json eslint.config.js jest.preset.js .npmrc ./
COPY apps ./apps
COPY libs ./libs
COPY packages ./packages
COPY config ./config
COPY contracts ./contracts
RUN pnpm install --frozen-lockfile

FROM workspace AS migrator
USER node
CMD ["pnpm", "db:migrate"]

FROM workspace AS prod-deps
RUN pnpm prune --prod --config.confirmModulesPurge=false

FROM workspace AS builder
ARG NX_PROJECT
RUN test -n "${NX_PROJECT}" \
  && pnpm exec nx build "${NX_PROJECT}"

FROM node:${NODE_VERSION} AS backend
ENV NODE_ENV=production \
  PORT=3000
WORKDIR /app
ARG BUILD_OUTPUT=dist/apps/backend/admin-app-api
ENV APP_MAIN=${BUILD_OUTPUT}/src/main.js
COPY --from=builder /workspace/package.json ./package.json
COPY --from=prod-deps /workspace/node_modules ./node_modules
COPY --from=builder /workspace/dist ./dist
USER node
EXPOSE 3000
CMD ["sh", "-c", "node \"$APP_MAIN\""]

FROM nginxinc/nginx-unprivileged:1.31.1-alpine AS frontend
ARG FRONTEND_OUTPUT=dist/apps/frontend/admin
USER root
COPY docker/nginx-fullstack.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/${FRONTEND_OUTPUT} /usr/share/nginx/html
USER 101
EXPOSE 8080
