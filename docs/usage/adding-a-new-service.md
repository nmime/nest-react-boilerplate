# Adding a New Service

Step-by-step guide to creating and wiring a new NestJS backend service in the monorepo.

## 1. Generate the service scaffold

Use the Nx generator through the `nrb add` CLI:

```bash
nrb add app my-service --dry-run
nrb add app my-service
```

This runs `nx g @nx/node:app --name=my-service` and creates the project structure.

For a NestJS-specific service, place it under `apps/backend/`:

```bash
# Move if the generator placed it elsewhere:
mkdir -p apps/backend/my-service/
mv apps/my-service apps/backend/my-service/my-service
```

Then create a `project.json`:

```json
{
  "name": "my-service",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/backend/my-service/my-service/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nx/webpack:webpack",
      "options": {
        "outputPath": "dist/apps/backend/my-service/my-service",
        "main": "apps/backend/my-service/my-service/src/main.ts",
        "tsConfig": "apps/backend/my-service/my-service/tsconfig.app.json",
        "compiler": "tsc"
      }
    },
    "serve": {
      "executor": "@nx/js:node",
      "options": {
        "buildTarget": "my-service:build"
      }
    }
  },
  "tags": ["platform:backend", "type:service"]
}
```

## 2. Wire the service to the bootstrap module

Import `@app/backend-common-bootstrap` for Nest app startup with health endpoints, Helmet, and validation pipes:

```typescript
// apps/backend/my-service/my-service/src/main.ts
import { bootstrap } from '@app/backend-common-bootstrap';

async function main() {
  const app = await bootstrap({
    appName: 'my-service',
    port: parseInt(process.env.MY_SERVICE_PORT ?? '3010'),
  });

  await app.listen(app.get('port'));
}

main();
```

## 3. Register the service in pnpm workspace

If the service has its own `package.json`, add it to `pnpm-workspace.yaml`. Most backend services use the monorepo's shared tooling and don't need separate packages.

## 4. Add a Docker Compose service (optional)

For local development, add the service to `docker/docker-compose.yml`:

```yaml
services:
  my-service:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - PORT=3010
    ports:
      - '3010:3010'
    depends_on:
      - postgres
```

## 5. Configure health endpoints

The bootstrap module automatically provides:

- `GET /health` — public health check
- `GET /health/private` — authenticated health check
- `GET /live` — liveness probe
- `GET /ready` — readiness probe

## 6. Add a feature module

If the service needs domain logic, scaffold a feature:

```bash
nrb add feature my-feature --api-app my-service
```

Then import the generated module into the service's main NestJS module.

## 7. Add database integration (optional)

Create a PostgreSQL feature library:

```bash
# The feature generator already creates libs/backend/postgres/main/<feature>/lib/
# Wire it to your service's module.
```

Or create a standalone persistence library under `libs/backend/postgres/main/<name>/lib`.

## 8. Tests and validation

```bash
# Run tests:
nx test my-service

# Lint and typecheck:
nx lint my-service
nx typecheck my-service

# Build:
nx build my-service

# Serve:
nx serve my-service
```

## 9. Register in the catalog (optional)

If you want the setup engine to manage this service, add it to the catalog:

```typescript
// packages/tooling/src/setup/catalog.ts
"my-service": {
  id: "my-service",
  label: "My Service",
  platform: "backend",
  requiresCapabilities: ["postgres"],
  requiresApps: [],
  conflictsWithCapabilities: [],
},
```

And add `"my-service"` to `BACKEND_APP_IDS` in `packages/tooling/src/setup/schema.ts`.

## Next steps

- [Adding a New Frontend Page](adding-a-new-frontend-page.md) — add the frontend counterpart.
- [Adding an Auth Provider](adding-an-auth-provider.md) — integrate authentication.
- [API Contracts](../api-contracts.md) — export OpenAPI and generate clients.
