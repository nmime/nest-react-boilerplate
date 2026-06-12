<!--
Thanks for contributing! Fill out every relevant section before requesting review.
-->

## Summary

<!-- What changed and why? -->

## Type of change

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `refactor` — internal restructuring, no behavior change
- [ ] `perf` — performance improvement
- [ ] `docs` — documentation only
- [ ] `test` — test-only change
- [ ] `chore` — build, tooling, dependencies
- [ ] `style` — formatting only

## Scope

- [ ] `apps/frontend/admin`
- [ ] `apps/frontend/app`
- [ ] `apps/frontend/landing`
- [ ] `apps/backend/admin-app-api`
- [ ] `apps/backend/user-app-api`
- [ ] `apps/backend/auth-app-api`
- [ ] `libs/frontend/ui` / design-system Storybook
- [ ] `libs/backend/common/*`
- [ ] `libs/common/*` shared cross-platform libraries
- [ ] `libs/backend/feature/*`
- [ ] `libs/backend/postgres/*`
- [ ] Tooling / CI / docs

## Changes

-
-

## Verification

<!-- Paste commands run and summarize results. -->

-

## Contributor policy checklist

- [ ] I used current `main` as the base for this branch.
- [ ] Author-sensitive commits use `nmime <66474195+nmime@users.noreply.github.com>` for both author and committer.
- [ ] No commit message contains `Co-authored-by`, `Signed-off-by`, Splox, Executor, bot, automation, or assistant trailers.
- [ ] This PR was not merged or squashed with GitHub web/API merge flows when author policy matters.
- [ ] No secrets, real environment values, credentials, Docker secret files, tokens, or full environment dumps are included.
- [ ] Generated artifacts are updated only when source changes require regeneration.
- [ ] I did not use Copilot, copilor, or an external AI coding assistant for repository changes.

## Nx quality gates

- [ ] `pnpm install --frozen-lockfile` passes
- [ ] `pnpm run tooling:static-check` passes
- [ ] `pnpm run lib:configs:check` passes when libraries/tooling config changed
- [ ] `pnpm run frontend:fsd:check` passes when frontend app/lib boundaries changed
- [ ] `pnpm run api:contracts:check`, `pnpm run api:clients:check`, and `pnpm run api:openapi:lint` pass when API surfaces changed
- [ ] `pnpm run db:migrations:check` passes when migrations changed
- [ ] `pnpm run lint` passes
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run test` passes
- [ ] `pnpm run test:e2e` passes when frontend app or API behavior changed
- [ ] `pnpm run storybook:build` / `pnpm run test:storybook` pass when shared UI/design-system behavior changed
- [ ] `pnpm run build` passes
- [ ] Documentation updated when architecture, commands, or public behavior changed
- [ ] Commit messages follow Conventional Commits (`type(scope): subject`)

## Breaking changes

- [ ] This PR contains no breaking changes
- [ ] This PR contains breaking changes described below

## Related issues

<!-- Example: Closes #123 -->
