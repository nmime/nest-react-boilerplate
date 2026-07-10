# Nx Generators

This monorepo uses Nx 23.0.1 with a set of built-in and custom generators. This page documents the configured generators and how to use them.

## Configured generators

### `@nx/node:app`

Generate a new Node.js application (NestJS backend service).

```bash
nx g @nx/node:app --name=my-service
```

Creates the app under `apps/backend/` and registers it in the Nx project graph.

### `@nx/node:lib`

Generate a new Node.js library.

```bash
nx g @nx/node:lib --name=my-lib
```

Creates the library under `libs/` with TypeScript configuration and build targets.

### `@nx/react:application`

Generate a new React application (Vite-based, CSS-styled).

```bash
nx g @nx/react:application --name=my-frontend
```

Configured defaults in `nx.json`:

- `babel: true`
- `style: "css"`
- `linter: "none"`
- `bundler: "vite"`

### `@nx/react:component`

Generate a React component.

```bash
nx g @nx/react:component --name=MyComponent --project=my-frontend
```

Configured defaults: `style: "css"`.

### `@nx/react:library`

Generate a React library.

```bash
nx g @nx/react:library --name=my-ui-lib
```

Configured defaults: `style: "css"`, `linter: "none"`.

## Custom generators

### `nrb add feature` (via `project:generate-vertical-slice`)

The custom feature generator scaffolds a complete vertical slice:

```bash
# Via nrb:
tooling add feature invoices --dry-run

# Via the project command directly:
tooling project:generate-vertical-slice invoices --api-app user-app-api --dry-run
```

Generated files:

| Path                                           | Description                            |
| ---------------------------------------------- | -------------------------------------- |
| `libs/backend/feature/<name>/shared/lib/`      | Shared DTOs and permissions            |
| `libs/backend/feature/<name>/main/lib/`        | NestJS module, controller, service     |
| `libs/backend/postgres/main/<name>/lib/`       | PostgreSQL entity and migration        |
| `libs/frontend/api-client/lib/src/features/`   | Frontend API client stub               |
| `apps/frontend/app/src/app/features/<name>/`   | React page stub                        |
| `docs/features/<name>/test-checklist.md`       | Test checklist                         |

Also updates `tsconfig.base.json` with three path aliases:

- `@app/backend-feature-<name>-main`
- `@app/backend-feature-<name>-shared`
- `@app/backend-postgres-main-<name>`

## Nx target defaults

The workspace configures these plugins and targets in `nx.json`:

| Plugin                | Target             | Description                          |
| --------------------- | ------------------ | ------------------------------------ |
| `@nx/eslint/plugin`   | `lint`             | ESLint for all projects              |
| `@nx/vite/plugin`     | `build`            | Vite build                           |
|                       | `test`             | Vitest unit tests                    |
|                       | `serve`            | Dev server                           |
|                       | `dev`              | Dev server alias                     |
|                       | `preview`          | Preview built output                 |
|                       | `serve-static`     | Serve static files                   |
|                       | `typecheck`        | TypeScript type checking             |
|                       | `build-deps`       | Build dependencies                   |
|                       | `watch-deps`       | Watch dependencies                   |

## Named inputs

| Input            | Contents                                                   |
| ---------------- | ---------------------------------------------------------- |
| `default`        | All files in the project root, plus `sharedGlobals`        |
| `production`     | `default` minus test files, stories, and spec configs      |
| `sharedGlobals`  | `tsconfig.base.json`, `eslint.config.js`, `package.json`, `pnpm-lock.yaml` |

## Common Nx commands

```bash
nx serve <project>              # Start dev server for a project
nx build <project>              # Build a project
nx test <project>               # Run tests for a project
nx lint <project>               # Lint a project
nx typecheck <project>          # Typecheck a project

nx run-many -t serve            # Serve all projects with a serve target
nx run-many -t build            # Build all projects
nx run-many -t test             # Test all projects

nx graph                        # Open the project graph in the browser
nx show project <name>          # Show project details
```

## Installed Nx packages

| Package                | Version |
| ---------------------- | ------- |
| `nx`                   | 23.0.1  |
| `@nx/js`               | 23.0.1  |
| `@nx/eslint`           | 23.0.1  |
| `@nx/jest`             | 23.0.1  |
| `@nx/devkit`           | 23.0.1  |
| `@nx/eslint-plugin`    | 23.0.1  |
| `@nx/module-federation`| 23.0.1  |
| `@nx/nest`             | 23.0.1  |
| `@nx/node`             | 23.0.1  |
| `@nx/react`            | 23.0.1  |
| `@nx/rollup`           | 23.0.1  |
| `@nx/vite`             | 23.0.1  |
| `@nx/vitest`           | 23.0.1  |
| `@nx/web`              | 23.0.1  |
| `@nx/webpack`          | 23.0.1  |
| `@nx/docker`           | 23.0.1  |

## Next steps

- [CLI Reference](cli-reference.md) — full `nrb` CLI commands.
- [Extending Generators](extending-generators.md) — add custom generators and modify existing ones.
