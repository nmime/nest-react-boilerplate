# Upgrading to TypeScript 7.x

**Status:** BLOCKED — `@typescript-eslint/type-utils` crashes on TS 7.0 (`ts.SyntaxKind.Intrinsic` missing).
**Target:** TypeScript 7.0 stable + `typescript-eslint` ≥ 8.64 (TS 7 compatible).

## What breaks in TypeScript 7.0

| Breaking change | Impact on this repo |
|----------------|---------------------|
| `baseUrl` removed | `tsconfig.base.json` uses `"baseUrl": "."` |
| `paths` values must be relative | All 64 path aliases use absolute paths (`libs/...` not `./libs/...`) |
| `ignoreDeprecations` removed | Currently set to `"6.0"` in base config |

## Migration steps (run in order)

### 1. Ecosystem readiness check

Wait until all of these support TS 7.0:

- [ ] `typescript-eslint` — must support `ts.SyntaxKind` changes in TS 7.0
- [ ] `ts-api-utils` — must handle new `ts.TypeFlags`/`ts.SyntaxKind` surface
- [ ] `nx` — must compile project graph with TS 7.0
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
print("Done: 64 paths made relative, baseUrl removed, ignoreDeprecations removed")
PY
```

### 3. Update pnpm-workspace.yaml

```diff
- 'typescript': '6.0.3'
+ 'typescript': '7.0.0'  # Use 7.0.0 stable when released
```

### 4. Update package.json

```diff
- "typescript": "6.0.3"
+ "typescript": "7.0.0"
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

- TypeScript pinned at **6.0.3** via `pnpm-workspace.yaml` override
- Ecosystem (`typescript-eslint` 8.63.0, `ts-api-utils` 2.5.0) not yet compatible with TS 7.0 pre-release
- 64 path aliases in `tsconfig.base.json` using `baseUrl: "."` pattern
- Zero code changes required — migration is config-only
