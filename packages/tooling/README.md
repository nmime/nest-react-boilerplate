# @repo/tooling

Workspace-local tooling package for repository scripts. Use the TypeScript CLI entrypoint instead of wiring root scripts to individual files:

```bash
pnpm --filter @repo/tooling tooling --help
pnpm --filter @repo/tooling tooling project check-library-configs
pnpm --filter @repo/tooling tooling project generate-vertical-slice invoices \
  --api-app user-app-api \
  --frontend-app user-app \
  --dry-run
pnpm --filter @repo/tooling tooling qa mutation --dry-run
pnpm --filter @repo/tooling tooling images webp --dry-run
pnpm --filter @repo/tooling tooling ui shadcn add dialog
pnpm --filter @repo/tooling tooling ui registry search --source magicui --query ripple
pnpm --filter @repo/tooling tooling ui registry add --source magicui ripple --view
pnpm --filter @repo/tooling tooling tooling static-check
pnpm --filter @repo/tooling tooling project dependency-map --json
pnpm --filter @repo/tooling tooling db migrations rollback-check
pnpm run bun:check
```

New commands should be implemented under `packages/tooling/src/commands` and registered in `packages/tooling/src/cli.ts`. Product-facing command names should also be listed in `docs/command-matrix.md`. The package uses `jiti` so command implementations stay in TypeScript without a build step for local workspace usage.

TS-first command implementations live under `packages/tooling/src/commands` grouped by domain:

- `api/` OpenAPI export, contract generation/checks, and typed client generation/checks.
- `db/` environment loading, migrations, seed/reset/backup/restore helpers.
- `docker/` Docker runtime checks, smoke tests, and fullstack e2e wrappers.
- `dev/` local fullstack orchestration.
- `project/` repository/project maintenance helpers.
  `project dependency-map` reports live dependency ownership and counts for every pnpm workspace.
- `images/` asset optimization helpers such as PNG/JPG/JPEG to WebP conversion.
- `ui/` reviewed source-owned shadcn/Magic UI discovery and import helpers.
  Aceternity is non-persistent research preview only: this template never
  applies or distributes it, and each downstream product must explicitly own
  any later licence, dependency, source, integration, and test decision.
- `testing/` Storybook, browser e2e coverage, and visual regression helpers.
- `qa/` local QA presets for OpenAPI lint/fuzz, consumer contracts, accessibility, browser matrix, performance, security SAST/secret scanning/DAST, mutation, and property checks.

Do not add root-level `tools/` wrappers. New local commands should be routed through `repo-tooling`.

`repo-tooling tooling static-check` is the safe static validation entrypoint for operational TypeScript tooling. It checks help-only CLI imports, command module presence, TypeScript typechecking, package-script references, generator regression tests, and stale architecture/version denylist terms, including retired Postgres shared-library path spellings, without executing deploy, Docker, destructive, or runtime-heavy scripts. `repo-tooling db migrations rollback-check` is intentionally separate: it is the real Testcontainers/PostgreSQL rollback check and requires a Docker-capable environment.

All QA presets are designed to be useful locally without depending on GitHub Actions. Expensive presets support `--dry-run` and environment variables documented in `docs/testing/modern-qa.md` so CI can choose a different cadence later.

## CI/security/deployment guardrails

- `pnpm run tooling:static-check` performs syntax checks for repository tooling, safe CLI help smoke tests, package-script reference checks, generator regression tests, and stale architecture/version/Postgres path wording guards. It intentionally avoids running Docker, deployment, or destructive database commands.
- `pnpm run agent:skills:check` tests the skill validator and checks every
  repo-local skill's trigger metadata, context/evidence sections, local
  references, interface prompt, package hygiene, catalog entry, and workflow discovery.
- `pnpm run format:changed` checks only changed Prettier-supported files against `origin/main...HEAD`; use it in PR-sized gates when full-repository formatting is too memory-heavy. Formatting intentionally uses stock Prettier defaults plus `.prettierignore`; no explicit Prettier config is required unless style requirements change.
- `pnpm run images:webp` converts PNG/JPG/JPEG assets to WebP side-by-side by default. Use `pnpm run images:webp:check` for a non-mutating dry-run, pass input directories after `--`, and use `--replace` only when source image deletion is intended.
- `pnpm run test:security:secrets` runs the native secret scanner by default and can be promoted to gitleaks with `SECRET_SCAN_ENGINE=gitleaks`. If an external engine is explicitly requested and unavailable, the command fails unless `SECRET_SCAN_FAIL_ON_UNAVAILABLE_EXTERNAL=false` is set for local dry-runs.
- `pnpm run test:security:sast` runs native SAST rules by default and can be promoted to semgrep with `SECURITY_SAST_ENGINE=semgrep`. External engine unavailability is fail-closed by default.
- `pnpm run deploy:validate` is the no-deploy validation bundle for production Docker Compose plus optional Helm, GitOps/Argo, and PM2 modes. Local runs do not require Helm globally: Helm rendering is skipped when Helm is unavailable unless `pnpm run deploy:validate:helm`, `--mode=helm`, or `REQUIRE_HELM=true` is used.
- `pnpm run branch:cleanup:check` previews merged-branch cleanup. `pnpm run branch:cleanup -- --apply` is required to delete local merged branches; remote deletion additionally requires `--remote`. Protected branches (`main`, `master`, `develop`, `release/*`, `hotfix/*`, production/staging names, and `origin/HEAD`) are never candidates.
- `pnpm run git:conventions` validates typed branch names, Conventional Commit subjects, linear history, and agent attribution. Human and trusted dependency-bot identities are accepted; known assistant identities must be replaced by exact `nmime` author/committer ownership. Use `--branch <name> --range <revision-range>` for CI or history audits.

Node and package-manager versions are intentionally pinned through `.nvmrc`, `packageManager`, `engines`, and `.npmrc` strictness. Use Node 24.18.0 and pnpm 11.15.1 for the canonical toolchain. Bun 1.3.14 is pinned through `.bun-version`; `pnpm run bun:check` runs its supported alternative-runtime contract locally and in CI.
