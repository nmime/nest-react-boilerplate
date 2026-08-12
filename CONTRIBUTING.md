# Contributing

Use this guide with the root [README](README.md), [Command matrix](docs/command-matrix.md), and the [Documentation Index](docs/README.md). AI coding agents must also follow [AGENTS.md](AGENTS.md) and the context guidance under [docs/ai](docs/ai/repo-map.md).

## Prerequisites

- Node.js `>=24 <25`; use `.nvmrc` for the current local patch version.
- pnpm `11.15.1` through Corepack.
- Docker Compose for the selected local PostgreSQL or replica-set MongoDB
  service, container builds, smoke tests, and full-stack e2e.

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
3. Keep the subject at 80 characters or fewer, and write a commit body whenever the subject cannot carry the reason. A body is required for commits that add or remove a pipeline definition, change a quality gate, replace a dependency or framework, or touch more than 20 non-generated files or 400 non-generated inserted lines. State what was rejected and why, not what the diff already shows. A decision that outlives the commit belongs in [docs/adr](docs/adr) as well.
4. Mark breaking changes explicitly with `!` after the type/scope or a `BREAKING CHANGE:` footer. A breaking change with neither marker releases as a minor version.
5. Human contributors keep their real Git author and committer identity. Commits produced by repository agents must use author and committer exactly `nmime <66474195+nmime@users.noreply.github.com>`. That identity is this repository's declared owner; a fork must change it in both the convention checker and [AGENTS.md](AGENTS.md) — see [Product identity](docs/product-identity.md).
6. Agent-produced commits must not add assistant, model, executor, or automation attribution trailers. Legitimate human contribution trailers remain allowed.
7. Do not use GitHub web merge/squash or GitHub API merge/squash for author-sensitive work; use raw git branch commits and pushes.
8. Document any new runtime variable in `.env.example`, relevant environment examples, and root/docs guidance.
9. Update generated contract and client artifacts only when the API source changed and the task includes regeneration.
10. Do not commit secrets, real `.env*` values, Docker secret files, `dist/`, `coverage/`, `.nx/`, Playwright reports, or local database volumes.

Run `pnpm run git:conventions` before pushing. CI validates the branch name,
every commit in the PR range, linear history, and agent attribution. Human and
trusted dependency-bot identities remain valid; known assistant identities must
be replaced by the required `nmime` author and committer.

### What the commit gate checks per commit

Beyond the subject shape, the gate reads each commit's own tree — not just the
tip — so a branch that is green at the end but broken in the middle is caught
while it can still be rewritten. `git bisect`, a revert, and a cherry-pick all
land on individual commits, so every commit has to stand on its own.

| Rule                                                         | Threshold                                                                                                                                | Escape                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Size cap                                                     | 100 non-generated files, 2000 non-generated insertions                                                                                   | `[bulk]` in the subject or body                                       |
| Body required                                                | above 20 non-generated files or 400 non-generated insertions                                                                             | write the body                                                        |
| Subject length                                               | 80 characters                                                                                                                            | —                                                                     |
| Generated output without its source                          | `pnpm-lock.yaml`, `.nrb/**`, `**/*.generated.*`, `**/__snapshots__/**`, `**/baselines/**`, `**/contracts/openapi/*.json`, `CHANGELOG.md` | `[regenerate]` in the subject or body                                 |
| Author and committer identity match                          | divergence must be explained                                                                                                             | a `Co-authored-by:`/`Signed-off-by:` trailer, or a forge-bot identity |
| Every lockfile importer has a `package.json` at that commit  | —                                                                                                                                        | —                                                                     |
| Every `tsconfig.base.json` path target exists at that commit | —                                                                                                                                        | —                                                                     |
| Every `@app/*` import resolves at that commit                | —                                                                                                                                        | —                                                                     |

Use an escape marker when the commit really is what the rule describes — a
mechanical sweep, or a regeneration whose source moved in an earlier commit —
not to get a red gate to go quiet.

Every threshold above is a default a product can retune from the `gitConventions`
key of its own `nrb.config.json`, so a fork never has to edit boilerplate tooling
source:

```json
{
  "schemaVersion": "1.0.0",
  "gitConventions": {
    "size": { "maxFilesChanged": 250 },
    "identity": { "allowedDivergentIdentities": ["*[bot]*", "release@example.com"] }
  }
}
```

### Local hooks (recommended)

CI is the authority, but it only speaks after a push, and by then rewriting
history is the only fix. Install local hooks for the fast signal. This
repository ships no hook manager on purpose — `core.hooksPath` needs no
dependency and, unlike husky, works inside a `git worktree`.

```bash
mkdir -p .git-hooks

cat > .git-hooks/commit-msg <<'HOOK'
#!/bin/sh
# Subject shape only; pnpm run git:conventions remains the authority.
head -n1 "$1" | grep -Eq '^(build|chore|ci|docs|feat|fix|perf|refactor|revert|test)(\([a-z0-9][a-z0-9/-]*\))?!?: [a-z0-9].+$' && exit 0
echo "commit-msg: subject must be <type>(<scope>)!: <lowercase description>" >&2
exit 1
HOOK

cat > .git-hooks/pre-push <<'HOOK'
#!/bin/sh
[ -n "$SKIP_GIT_CONVENTIONS" ] && exit 0
pnpm run git:conventions
HOOK

chmod +x .git-hooks/commit-msg .git-hooks/pre-push
git config core.hooksPath .git-hooks
```

`git commit --no-verify` and `SKIP_GIT_CONVENTIONS=1 git push` bypass them for
automation. Keep `.git-hooks/` untracked and out of review.

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
- Keep shared libraries in their current split: `libs/backend/common/**`,
  `libs/backend/feature/<scope>/<layer>/lib/**`,
  `libs/backend/{postgres,mongodb}/main/**`, `libs/frontend/**`, and the
  cross-runtime `libs/common/**` set. Root translation catalogs live in thin
  scoped files under `i18n/<locale>/<scope>/<component>.json`; keep each file
  under 60 keys and 90 non-empty lines.
- Canonical provider infrastructure lives in
  `libs/backend/{postgres,mongodb}/main/shared/lib`; feature persistence
  libraries live below the owning provider and scope, for example
  `libs/backend/postgres/main/auth/lib` or
  `libs/backend/mongodb/main/auth/lib`.
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

## Release notes

Release notes are generated by semantic-release from Conventional Commit
subjects and published with the release. Do not hand-edit release notes, and do
not add an entry to a changelog file as part of a PR.

Because the commit subject _is_ the release note, write it for a reader who was
not in the PR. `fix(auth): correct cookie flags` is a release note;
`fix(auth): address review` is not.

`CHANGELOG.md` is this boilerplate's own frozen release history, kept for
upstream reference only. It is not maintained per PR, nothing gates it, and a
product forked from this repository should delete it — see
[Product identity](docs/product-identity.md).

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
- Keep the root `docker-compose.yml` focused on selectable local PostgreSQL or
  replica-set MongoDB services and `docker/docker-compose.yml` focused on the
  selected full stack.
- Update Docker, CI, runbook, or troubleshooting docs whenever operational behavior changes.
- Document only behavior that is verified in source or by running the relevant command.
