# Deployment Platform Support

This boilerplate supports deployment from GitHub or GitLab.

## CI/CD comparison

| Feature            | GitHub                             | GitLab                             |
| ------------------ | ---------------------------------- | ---------------------------------- |
| CI config          | `.github/workflows/`               | `.gitlab-ci.yml`                   |
| MR/PR templates    | `.github/PULL_REQUEST_TEMPLATE.md` | `.gitlab/merge_request_templates/` |
| Issue templates    | `.github/ISSUE_TEMPLATE/`          | `.gitlab/issue_templates/`         |
| Dependency updates | Dependabot                         | GitLab Dependency Scanning         |
| GitOps promotion   | Manual promotion PR workflow       | Product-owned pipeline/MR          |
| Releases           | Native GitHub Actions              | Native GitLab CI                   |
| Container registry | GHCR                               | GitLab Container Registry          |

## Helm values

Helm charts in `.helm/` are platform-agnostic. They reference container images by repository/tag — adjust the `image.repository` values for your registry:

- GitHub: `ghcr.io/your-github-org/nest-react-boilerplate/${service}`
- GitLab: `registry.gitlab.com/${CI_PROJECT_PATH}/${service}`

## GitOps reconciliation

The promotion workflow (`.github/workflows/deploy.yml`) is GitHub-specific and
opens a reviewed image-tag PR. Argo CD and Flux manifests are provider-agnostic.
For GitLab:

1. Build and verify all release image digests and their full-SHA tags.
2. Update every image tag in `.helm/values-production.yaml` on a topic branch.
3. Run `pnpm run deploy:validate:gitops` and merge through normal review.
4. Let Argo CD or Flux reconcile the same chart and values.

See [GITOPS.md](../GITOPS.md) for both controller setups.

## Automated releases

`release.config.mjs` selects exactly one semantic-release provider. GitHub
Actions sets `RELEASE_PROVIDER=github` and uses the repository `GITHUB_TOKEN`.
GitLab CI sets `RELEASE_PROVIDER=gitlab` and runs the release job on the default
branch push pipeline only when `GITLAB_TOKEN` or `GL_TOKEN` is configured as a
protected CI/CD variable. Immediately before semantic-release, the job fetches
the remote default branch and refuses to publish unless it still equals
`CI_COMMIT_SHA`, preventing a delayed successful pipeline from releasing after
the branch advances. GitLab uses `CI_REPOSITORY_URL` so release tags target the
GitLab clone instead of this template's GitHub repository metadata.

Both providers use the latest `vMAJOR.MINOR.PATCH` tag as the Semantic
Versioning baseline. `fix`, `perf`, and `revert` commits increment patch;
`feat` increments minor; and `!` or a `BREAKING CHANGE:` footer increments
major. Other accepted commit types do not publish by themselves. Squashing or
rewriting commit history never changes a release number unless the release tag
itself is deliberately replaced. Releases tag the already-reviewed default
branch commit and publish generated notes through the selected provider; they
never push an unreviewed changelog commit to a protected branch.

Semantic-release groups Conventional Commits into stable sections for
features, fixes, performance, reverts, refactors, documentation, build, CI,
tests, and maintenance. GitHub's `.github/release.yml` uses corresponding PR
label categories when a maintainer generates notes manually. Add the
`skip-changelog` label only when a PR must be omitted from manual generated
notes; it does not override semantic-release commit analysis.
