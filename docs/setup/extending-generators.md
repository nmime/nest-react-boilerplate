# Extending Generators

This page explains the internal architecture of the NRB setup and feature generators, and how to extend them with new catalog entries, planner operations, filesystem adapters, and templates.

## Architecture overview

The setup engine consists of five layers:

```
CLI (setup.ts, add.ts)
  ↓
Schema (schema.ts) — Zod validation
  ↓
Presets (presets.ts) — preset → apps + capabilities
  ↓
Catalog (catalog.ts) — app/capability metadata, dependency expansion, validation
  ↓
Planner (planner.ts) — pure function: config + state → sorted operations
  ↓
Apply (apply.ts) — execute operations through filesystem adapter
  ↓
State (state.ts) — track file hashes for idempotency
```

The feature generator (`generate-vertical-slice.ts`) is a separate path used by `pnpm nrb add feature`.

## Adding a new app to the catalog

Edit `packages/tooling/src/setup/catalog.ts`:

```typescript
// In APP_CATALOG:
"my-new-app": {
  id: "my-new-app",
  label: "My New App",
  platform: "backend",           // "frontend" | "backend" | "e2e"
  requiresCapabilities: ["postgres"],
  requiresApps: [],
  conflictsWithCapabilities: [],
},
```

Then add the ID to the enum in `schema.ts`:

```typescript
export const BACKEND_APP_IDS = [
  // ... existing ...
  'my-new-app',
] as const;
```

## Adding a new capability to the catalog

Edit `packages/tooling/src/setup/catalog.ts`:

```typescript
// In CAPABILITY_CATALOG:
"my-capability": {
  id: "my-capability",
  label: "My Capability",
  requiresCapabilities: [],
  conflictsWith: [],
},
```

Then add the ID to the enum in `schema.ts`:

```typescript
export const CAPABILITY_IDS = [
  // ... existing ...
  'my-capability',
] as const;
```

## Adding a new preset

Edit `packages/tooling/src/setup/presets.ts`:

```typescript
{
  id: "my-preset",
  description: "Short description of the preset",
  apps: ["user-app", "user-app-api", "auth-app-api"],
  capabilities: ["postgres", "i18n"],
},
```

Then add the ID to `PRESET_IDS` in `schema.ts`:

```typescript
export const PRESET_IDS = [
  // ... existing ...
  'my-preset',
] as const;
```

## Adding planner operations

The planner produces three types of operations:

| Operation                   | Description                                  |
| --------------------------- | -------------------------------------------- |
| `createFile(path, content)` | Create a new file with the given content.    |
| `updateFile(path, content)` | Overwrite an existing file with new content. |
| `deleteFile(path)`          | Remove a file (only when `prune: true`).     |

To add new operations, edit `packages/tooling/src/setup/planner.ts`. The `plan()` function:

1. Resolves the config (preset expansion + dependency resolution).
2. Generates metadata files (`nrb.config.json`, `.nrb/summary.md`).
3. Diffs desired state against current state.
4. Returns sorted operations.

To add custom file generation, follow the pattern of `generateConfigFile()` and `generateSummaryMd()`:

```typescript
export function generateCustomFile(config: NrbConfig): { path: string; content: string } {
  return {
    path: '.nrb/custom.json',
    content: JSON.stringify(config, null, 2) + '\n',
  };
}
```

Then add it to the `desiredFiles` map in `plan()`.

## Adding a filesystem adapter

The apply engine uses an adapter interface defined in `packages/tooling/src/setup/adapters/filesystem.ts`. The default implementation (`node-filesystem.ts`) uses Node.js `fs` module.

To add a custom adapter (e.g., for testing or virtual filesystems):

```typescript
import type { FilesystemAdapter } from './filesystem.js';

export const mockAdapter: FilesystemAdapter = {
  readFile(path) {
    /* ... */
  },
  writeFile(path, content) {
    /* ... */
  },
  deleteFile(path) {
    /* ... */
  },
  exists(path) {
    /* ... */
  },
  mkdir(dir) {
    /* ... */
  },
  readDir(dir) {
    /* ... */
  },
};
```

Pass the adapter to `apply(operations, adapter, options)`.

## Extending the feature generator

The feature generator lives in `packages/tooling/src/commands/project/generate-vertical-slice.ts`. It:

1. Parses args (`--name`, `--dry-run`, `--force`, `--api-app`).
2. Generates template files for backend DTOs, module, controller, service, PostgreSQL entity, and frontend client.
3. Updates `tsconfig.base.json` path aliases.
4. Outputs next steps.

To add new template files, edit `createTemplateFiles()`:

```typescript
function createTemplateFiles(names: Names, apiApp: string): TemplateFile[] {
  return [
    // ... existing templates ...
    {
      path: `libs/backend/feature/${names.kebab}/main/lib/src/${names.kebab}.resolver.ts`,
      contents: `// GraphQL resolver template for ${names.pascal}\n`,
    },
  ];
}
```

To add support configs, edit `createSupportConfigFiles()`.

## Adding a custom command

Edit `packages/tooling/src/cli.ts`:

```typescript
register('my:command', 'Description of my command.', ({ argv, workspaceRoot }) => {
  // Your implementation
  return 0;
});
```

For script-based commands (lives in `commands/`):

```typescript
registerScript('my:command', 'Description of my command.', 'my/command.ts');
```

Then create `packages/tooling/src/commands/my/command.ts`.

## Testing generators

- Schema tests: `packages/tooling/src/setup/schema.test.ts`
- Planner tests: `packages/tooling/src/setup/planner.test.ts`
- Apply tests: `packages/tooling/src/setup/apply.component.test.ts`
- Setup command tests: `packages/tooling/src/commands/project/setup.test.ts`
- Setup e2e tests: `packages/tooling/src/commands/project/setup.e2e.test.ts`
- Feature generator tests: `packages/tooling/src/commands/project/generate-vertical-slice.test.ts`

Run with:

```bash
pnpm --filter @repo/tooling test
```

## Next steps

- [Migration Guide](migration.md) — migrate from legacy scripts to the setup engine.
- [CLI Reference](cli-reference.md) — full command reference.
