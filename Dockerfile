# syntax=docker/dockerfile:1

# ────────────────────────────────────────────
# Stage 1: Install dependencies + build
# ────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ && \
    corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy each package's package.json (leverage Docker layer cache)
COPY packages/database/package.json ./packages/database/
COPY apps/api/package.json ./apps/api/

# Install all dependencies. Build scripts are approved explicitly by the workspace.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code
COPY packages/database ./packages/database
COPY apps/api ./apps/api

# Build database package (api depends on its dist/)
RUN pnpm --filter @workspace/database build

# Build api
RUN pnpm --filter api build

# pnpm deploy outputs a flat structure with complete workspace dependencies.
RUN pnpm --filter api deploy --prod --legacy /app/deploy

# pnpm deploy only copies node_modules, not build artifacts — copy manually.
RUN cp -r /app/apps/api/dist /app/deploy/dist

# ────────────────────────────────────────────
# Stage 2: Production image
# ────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/deploy ./

EXPOSE 3000

CMD ["node", "dist/main.js"]
