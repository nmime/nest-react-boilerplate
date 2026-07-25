# Contributing

Use this guide with the root [README](README.md), [Command matrix](docs/command-matrix.md), and the [Documentation Index](docs/README.md). AI coding agents must also follow [AGENTS.md](AGENTS.md) and the context guidance under [docs/ai](docs/ai/repo-map.md).

## Prerequisites

- Node.js `>=24 <25`; use `.nvmrc` for the current local patch version.
- pnpm `11.15.1` through Corepack.
- Docker Compose for PostgreSQL, container builds, smoke tests, and full-stack e2e.

```bash
nvm use
corepack enable
corepack prepare pnpm@11.15.1 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

## Branch, commit, and PR workflow

1. Branch from current `main` as `<type>/<kebab-case>`, for example `feat/billing-settings` or `fix/auth-cookie-flags`. Allowed types are `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`, `build`, `revert`, `release`, and `hotfix`. Never use `codex`, `claude`, or another assistant/vendor identity as a branch segment. Dependabot's generated prefix is the only automation exception.
2. Use Conventional Commits: `<type>(<optional-scope>)!: <lowercase description>`. Use the same types as branches except `release` and `hotfix`; express release metadata as `chore(release): <version>`.
3. Human contributors keep their real Git author and committer identity. Commits produced by repository agents must use author and committer exactly `nmime <66474195+nmime@users.noreply.github.com>`.
4. Agent-produced commits must not add assistant, model, executor, or automation attribution trailers. Legitimate human contribution trailers remain allowed.
5. Do not use GitHub web merge/squash or GitHub API merge/squash for author-sensitive work; use raw git branch commits and pushes.
6. Document any new runtime variable in `.env.example`, relevant environment examples, and root/docs guidance.
7. Update generated contract and client artifacts only when the API source changed and the task includes regeneration.
8. Do not commit secrets, real `.env*` values, Docker secret files, `dist/`, `coverage/`, `.nx/`, Playwright reports, or local database volumes.

Run `pnpm run git:conventions` before pushing. CI validates the branch name,
every commit in the PR range, linear history, and agent attribution. Human and
trusted dependency-bot identities remain valid; known assistant identities must
be replaced by the required `nmime` author and committer.

## Release numbering

Releases follow Semantic Versioning and are created only from `main` by
semantic-release. The latest valid `vMAJOR.MINOR.PATCH` tag is the version
baseline; commit count and squash count never affect the version number.

- `fix`, `perf`, and `revert` produce a patch release.
- `feat` produces a minor release.
- `!` after the type/scope or a `BREAKING CHANGE:` footer produces a major release.
- `build`, `chore`, `ci`, `docs`, `refactor`, and `test` do not release by themselves.

Release commits use `chore(release): MAJOR.MINOR.PATCH [skip ci]`, tags use
`vMAJOR.MINOR.PATCH`, and both author and committer remain the repository owner.
Generated notes use stable Features, Bug Fixes, Performance, Reverts,
Documentation, Build, CI, Tests, and Maintenance sections.

## Workspace rules

- Put backend deployables under `apps/backend/<scope>/**` and frontend deployables under `apps/frontend/**`.
- Keep shared libraries in their current split: `libs/backend/common/**`, `libs/backend/feature/<scope>/<layer>/lib/**`, `libs/backend/postgres/main/shared/lib`, `libs/frontend/**`, and the remaining cross-runtime `libs/common/**` set. Root translation catalogs live in thin scoped files under `i18n/<locale>/<scope>/<component>.json`; keep each file under 60 keys and 90 non-empty lines.
- Canonical PostgreSQL shared infrastructure is `libs/backend/postgres/main/shared/lib`; feature persistence libraries live below the owning scope, for example `libs/backend/postgres/main/auth/lib`.
- Canonical OpenAPI producer output is `apps/backend/*/*-app-api/contracts/openapi/*.json`; shared generated contract review types are in `libs/common/api-contracts/lib/src/generated`; frontend generated clients are in `libs/frontend/api-client/lib/src/generated`.
- Do not invent top-level contract directories, alternate OpenAPI consumer folders, or duplicate generated-client locations.
- Use Nx project names in commands.
- Keep cross-project imports on the configured `@app/*` path aliases; use `@app/frontend-feature-admin-shared` and `@app/backend-feature-admin-shared` for admin shared imports.
- Add public developer commands to `package.json` and [Command matrix](docs/command-matrix.md).
- Add local automation under `packages/tooling/src` and expose supported commands through `packages/tooling/bin/repo-tooling.mjs`.
- Do not use Copilot, copilor, or external AI coding assistants for repository changes.

## Generated artifacts

Generated files are review artifacts, not hand-authored design space.

- API source changes flow from Nest controllers/DTOs/decorators to OpenAPI JSON, shared generated contract review types, and generated frontend clients.
- Fix source metadata or generator scripts first; then run the repository generation/check commands.
- Commit generated diffs together with the source changes that justify them.
- Leave generated artifacts untouched for docs-only, tooling-only, or unrelated refactors.

## Required checks before a PR

Run the fast local preflight before every PR:

```bash
pnpm run check:fast
```

Add the targeted checks that match the changed surface area:

```bash
pnpm run db:migrations:check      # database migrations
pnpm run test:coverage            # runtime TypeScript changes
pnpm run test:e2e                 # cross-app behavior changes
pnpm run test:fullstack           # Docker-backed full-stack behavior
pnpm run build                    # build, package, or Docker changes
pnpm run audit                    # dependency changes
```

Run `pnpm run check` for release-risk, security-sensitive, or broad cross-cutting changes before requesting merge.

Coverage thresholds are defined in `packages/tooling/src/testing/vitest-coverage.mts`; run `pnpm run test:coverage` for runtime TypeScript changes. New projects default to 100%. Existing negative thresholds are maximum uncovered-item budgets and must only move toward zero as coverage improves.

## Changelog

Every PR that changes user-facing behavior MUST include a changelog entry:

1. Edit `CHANGELOG.md`
2. Add your change under `[Unreleased]` with the appropriate heading:
   - `### Added` for new features
   - `### Changed` for changes in existing functionality
   - `### Fixed` for bug fixes
   - `### Removed` for deprecated/removed features
3. Follow the format: `- Brief description of the change (#PR_NUMBER)`

Example:

```markdown
## [Unreleased]

### Fixed

- Deploy workflow now gated on CI success (#42)
- Docker Node.js version corrected to 24.18.0 (#43)
```

## Backend changes

- Use `@app/backend-common-bootstrap` (`libs/backend/common/bootstrap/lib`) for Nest app startup.
- Preserve Helmet, strict validation, and secure production CORS behavior.
- Keep `GET /health` available for deploy health checks.
- Never log secrets or full environment objects.
- Keep OAuth disabled unless an app explicitly supplies provider configuration and product-specific callback handling.
- Follow [database migration standards](docs/database-migrations.md): explicit `NOT NULL`, `VARCHAR` plus checks instead of enums, and deterministic constraint/index names.
- Run `pnpm run lib:configs:check` after library split/config changes, `pnpm run tooling:static-check` after tooling/script changes, and the API/client/OpenAPI or DB migration checks when those surfaces change.

## Frontend changes

- Reuse `@app/frontend-ui-web` primitives for shared React DOM layout and components. Storybook configuration and stories are owned directly by `libs/frontend/ui-web/lib`; there is no generic UI compatibility facade.
- Use `@app/frontend-ui-native` for Expo/React Native UI. Keep mobile wiring in
  the owner listed by the [Project Catalog](docs/project-catalog.md), and use
  `EXPO_PUBLIC_*` variables for mobile-safe public runtime configuration.
- Follow [frontend state architecture](docs/frontend-state.md) for TanStack Query, MobX shell state, theme/i18n ownership, raw-fetch limits, and copy rules.
- Keep static smoke checks, Storybook stories, and user-visible copy assertions in sync when frontend shells change.
- Keep browser-facing API base URLs documented with the matching `VITE_*` variable.

## Deployment and documentation changes

- Keep the root `Dockerfile` aligned with current Nx project names and output paths.
- Keep the root `docker-compose.yml` focused on local PostgreSQL and `docker/docker-compose.yml` focused on the full stack.
- Update Docker, CI, runbook, or troubleshooting docs whenever operational behavior changes.
- Document only behavior that is verified in source or by running the relevant command.
