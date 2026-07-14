# Security Platform Comparison

## Feature matrix

| Feature            | GitHub              | GitLab                 | Bitbucket           |
| ------------------ | ------------------- | ---------------------- | ------------------- |
| PR/MR templates    | ✅                  | ✅                     | Partial             |
| Secret scanning    | ✅ Gitleaks         | ✅ Secret Detection    | ✅ Gitleaks         |
| Dependency updates | ✅ Dependabot       | ✅ Dependency Scanning | ❌ (manual)         |
| SAST               | ✅ CodeQL           | ✅ SAST                | ❌ (use external)   |
| Container scanning | Docker build checks | ✅ Container Scanning  | Docker build checks |
| CODEOWNERS         | ✅                  | ✅                     | ❌                  |
| Branch protection  | ✅                  | ✅                     | ✅                  |
| Scorecard          | ✅                  | ❌                     | ❌                  |

## Platform setup notes

### GitHub

- CODEOWNERS in .github/CODEOWNERS
- Dependabot in .github/dependabot.yml
- CodeQL in .github/workflows/codeql.yml
- Security advisories via Settings → Security

### GitLab

- CODEOWNERS in .github/CODEOWNERS (works on GitLab too)
- CI/CD pipelines auto-included via template imports
- SAST/Secret Detection/Dependency Scanning via include:template

### Bitbucket

- No native CODEOWNERS — use Bitbucket branches restriction
- No native Dependabot — run pnpm audit manually or via pipeline
- Bitbucket Pipelines defined in bitbucket-pipelines.yml
