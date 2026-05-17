# Branch protection recommendation

If repository settings are not managed automatically, protect `main` with:

- pull requests required before merge;
- `pnpm check`, CodeQL, and relevant deployment checks required;
- stale approvals dismissed after new commits;
- conversation resolution required;
- force pushes and branch deletion disabled;
- signed commits/tags if your organization requires them.

Use squash merges for boilerplate-sized feature branches unless release history requires merge commits.
