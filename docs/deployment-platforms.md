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
branch only when `GITLAB_TOKEN` or `GL_TOKEN` is configured as a protected CI/CD
variable. GitLab uses `CI_REPOSITORY_URL` so release commits and tags target the
GitLab clone instead of this template's GitHub repository metadata.
