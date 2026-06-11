# Branch protection recommendation

If repository settings are not managed automatically, protect `main` with:

- pull requests required before merge;
- `pnpm check`, CodeQL, and relevant deployment checks required;
- stale approvals dismissed after new commits;
- conversation resolution required;
- force pushes and branch deletion disabled;
- signed commits/tags if your organization requires them.

Use squash merges for boilerplate-sized feature branches unless release history requires merge commits.

## Branch cleanup safety

Use `pnpm run branch:cleanup:check` before deleting stale branches. The check mode prints JSON with the merged local candidates for `origin/main` and does not mutate refs. To delete local merged branches, run `pnpm run branch:cleanup -- --apply`. Remote cleanup is opt-in and requires both `--remote` and `--apply`, which prevents accidental deletion during CI, audits, or dry runs.

The cleanup guard never proposes protected refs: `main`, `master`, `develop`, `development`, `release/*`, `hotfix/*`, `prod`, `production`, `staging`, or `origin/HEAD`. Keep remote branch cleanup disabled in CI unless a repository maintainer is executing a reviewed maintenance workflow.
