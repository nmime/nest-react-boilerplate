# Upgrading to TypeScript 7.x

**Status:** BLOCKED for the default toolchain. Nx 23.x supports TypeScript `>=5.8 <6.1`,
and Nx 23.1.0 cannot build this workspace's project graph when TypeScript 7.0.2
replaces the workspace compiler.
**Target:** Adopt TypeScript 7 only after Nx supports it as the workspace compiler,
or evaluate Nx's documented side-by-side TypeScript 7 build path in a dedicated branch.

## What breaks in TypeScript 7.0

| Breaking change                 | Impact on this repo                                                  |
| ------------------------------- | -------------------------------------------------------------------- |
| `baseUrl` removed               | `tsconfig.base.json` uses `"baseUrl": "."`                           |
| `paths` values must be relative | All 82 path aliases use absolute paths (`libs/...` not `./libs/...`) |
| `ignoreDeprecations` removed    | Currently set to `"6.0"` in base config                              |

## Migration steps (run in order)

### 1. Ecosystem readiness check

Wait until all of these support TS 7.0 in the same configuration used by this
workspace:

- [x] `typescript-eslint` — 8.65.0 is installed
- [ ] `ts-api-utils` — must handle the TypeScript 7 API surface used by linting
- [ ] `nx` — must compile the project graph with TypeScript 7.0
- [ ] `vite` — must resolve TS 7.0 module resolution
- [ ] `vitest` — must pass tests under TS 7.0 types

### 2. Update tsconfig.base.json

One-shot script (safe to run on any branch):

```bash
python3 << 'PY'
import json, re

with open("tsconfig.base.json") as f:
    lines = f.readlines()

out = []
for line in lines:
    # Remove "baseUrl": "."
    if '"baseUrl"' in line:
        continue
    # Remove "ignoreDeprecations"
    if '"ignoreDeprecations"' in line:
        continue
    # Prefix path values with ./
    if '"libs/' in line:
        line = line.replace('"libs/', '"./libs/')
    if '"i18n/' in line:
        line = line.replace('"i18n/', '"./i18n/')
    out.append(line)

with open("tsconfig.base.json", "w") as f:
    f.writelines(out)
print("Done: 82 paths made relative, baseUrl removed, ignoreDeprecations removed")
PY
```

### 3. Update pnpm-workspace.yaml

```diff
- 'typescript': '6.0.3'
+ 'typescript': '7.0.2'
```

### 4. Update package.json

```diff
- "typescript": "6.0.3"
+ "typescript": "7.0.2"
```

### 5. Reinstall and verify

```bash
pnpm install
pnpm exec nx run-many -t typecheck --all
pnpm exec nx run-many -t test --all
```

### 6. Rollback plan

```bash
git checkout -- tsconfig.base.json pnpm-workspace.yaml package.json
pnpm install
```

## Current state (July 2026)

- TypeScript pinned at **6.0.3**, the newest release supported by Nx 23.x
- `typescript-eslint` is **8.65.0**; `ts-api-utils` is **2.5.0**
- A direct TypeScript 7.0.2 trial failed during Nx project-graph creation, before
  application builds could start
- 82 path aliases in `tsconfig.base.json` using `baseUrl: "."` pattern
- Zero code changes required — migration is config-only

Installed versions are the ones in `package.json` and the resolved store;
`minimumReleaseAgeExclude` entries in `pnpm-workspace.yaml` are release-age
exclusions reviewed for this scaffold refresh, not the installed versions.

Nx references:

- [TypeScript compatibility](https://nx.dev/docs/technologies/typescript/introduction#typescript-compatibility)
- [Using TypeScript 7 with Nx](https://nx.dev/docs/technologies/typescript/guides/typescript-7)
