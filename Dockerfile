# syntax=docker/dockerfile:1

ARG NODE_VERSION=26-alpine
ARG PNPM_VERSION=10.32.1

FROM node:${NODE_VERSION} AS workspace
ARG PNPM_VERSION
WORKDIR /workspace
RUN apk add --no-cache libc6-compat python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json eslint.config.js jest.preset.js .npmrc ./
COPY apps ./apps
COPY libs ./libs
COPY tools ./tools
RUN pnpm install --frozen-lockfile

FROM workspace AS builder
ARG NX_PROJECT
RUN test -n "${NX_PROJECT}" \
  && pnpm exec nx build "${NX_PROJECT}"

FROM node:${NODE_VERSION} AS backend
ENV NODE_ENV=production \
  PORT=3000
WORKDIR /app
ARG BUILD_OUTPUT=dist/apps/backend/admin-app-api
COPY --from=builder /workspace/package.json ./package.json
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/${BUILD_OUTPUT} ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM nginx:1.27-alpine AS frontend
ARG FRONTEND_OUTPUT=dist/apps/frontend/admin
COPY docker/nginx-fullstack.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/${FRONTEND_OUTPUT} /usr/share/nginx/html
EXPOSE 80
