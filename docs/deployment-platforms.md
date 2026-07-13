# Deployment Platform Support

This boilerplate supports deployment from GitHub, GitLab, or Bitbucket.

## CI/CD comparison

| Feature | GitHub | GitLab | Bitbucket |
|---------|--------|--------|-----------|
| CI config | .github/workflows/ | .gitlab-ci.yml | bitbucket-pipelines.yml |
| MR/PR templates | .github/PULL_REQUEST_TEMPLATE.md | .gitlab/merge_request_templates/ | bitbucket (partial) |
| Issue templates | .github/ISSUE_TEMPLATE/ | .gitlab/issue_templates/ | ❌ |
| Dependabot | ✅ | ❌ (use GitLab Dep Scanning) | ❌ |
| ArgoCD | ✅ deploy.yml triggers | Manual pipeline trigger | Manual pipeline trigger |
| Container registry | GHCR | GitLab Container Registry | Bitbucket (no native) |

## Helm values

Helm charts in `.helm/` are platform-agnostic. They reference container images by repository/tag — adjust the `image.repository` values for your registry:

- GitHub: `ghcr.io/nmime/nest-react-boilerplate/${{ service }}`
- GitLab: `registry.gitlab.com/${CI_PROJECT_PATH}/${service}`
- Bitbucket: Use Docker Hub or a third-party registry

## ArgoCD sync

The deploy workflow (.github/workflows/deploy.yml) is GitHub-specific. For GitLab or Bitbucket:

1. Set up ArgoCD Application manually
2. Configure the repo source and Helm chart path
3. Set sync policy to automated with prune
4. Use the same .helm/values-production.yaml

See GITOPS.md for full ArgoCD setup.
