# CI observability

This repository keeps CI results visible from multiple places so failures remain diagnosable even when the GitHub check-run API is unavailable to a local token or automation account.

## PR gate order

The `CI` workflow starts with a dedicated `Fast PR gate (check:fast)` job. It runs:

```bash
pnpm run check:fast
```

That command covers Prettier, Nx lint, Nx typecheck, and unit tests. Longer quality, browser, Docker smoke, runtime QA, and fullstack e2e jobs wait behind that fast gate so common failures surface early.

The `Helm render validation` job also runs the dependency-free deployment configuration assertions before Helm setup and rendering:

```bash
node scripts/validate-deployment-config.mjs
node scripts/validate-helm-rate-limit-config.mjs
```

Those assertions keep Docker Compose, Helm, environment examples, nginx routing, runtime hardening, production secret handling, and Helm Redis-backed rate-limit drift visible in the same early CI surface as the Helm render gate.

## Status summaries

The CI workflow has a final `CI status summary` job with `if: always()`. It writes a Markdown table of every CI job result to the GitHub step summary and uploads the same table as the `ci-status-summary` artifact.

CodeQL and Dependency Review also write step summaries and upload small Markdown artifacts. Use these summaries when the Checks tab, check-run API, or local personal access token permissions do not expose detailed check results.

## Workflow status pages

Use the GitHub Actions workflow pages for current run history and badges when repository readers have authenticated access:

- CI: `.github/workflows/ci.yml`
- CodeQL: `.github/workflows/codeql.yml`
- Dependency review: `.github/workflows/dependency-review.yml`

Workflow-level links are preferred so private-repository readers can click through to the authenticated run history.

## Dependabot labels

Dependabot can only apply labels that already exist. The GitHub Actions update configuration uses the existing `dependencies` label and a `ci` commit-message prefix instead of requesting a missing `ci` label.
