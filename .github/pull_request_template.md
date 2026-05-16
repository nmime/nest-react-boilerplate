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
- [ ] `libs/frontend/ui`
- [ ] `libs/common/bootstrap`
- [ ] `libs/common/validation`
- [ ] `libs/common/response`
- [ ] `libs/feature/auth/oauth`
- [ ] Tooling / CI / docs

## Changes

-
-

## Verification

<!-- Paste commands run and summarize results. -->

-

## Nx quality gates

- [ ] `pnpm install --frozen-lockfile` passes
- [ ] `pnpm exec nx run-many -t lint --all` passes
- [ ] `pnpm exec nx run-many -t typecheck --all` passes
- [ ] `pnpm exec nx run-many -t test --all` passes
- [ ] `pnpm exec nx run-many -t e2e --projects=admin-app,user-app,landing-app` passes when frontend app behavior changed
- [ ] `pnpm exec nx run-many -t build --all` passes
- [ ] Documentation updated when architecture, commands, or public behavior changed
- [ ] Commit messages follow Conventional Commits (`type(scope): subject`)

## Breaking changes

- [ ] This PR contains no breaking changes
- [ ] This PR contains breaking changes described below

## Related issues

<!-- Example: Closes #123 -->
