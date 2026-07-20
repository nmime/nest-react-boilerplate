# Security Platform Comparison

## Feature matrix

| Feature            | GitHub              | GitLab                 |
| ------------------ | ------------------- | ---------------------- |
| PR/MR templates    | ✅                  | ✅                     |
| Secret scanning    | ✅ Gitleaks         | ✅ Secret Detection    |
| Dependency updates | ✅ Dependabot       | ✅ Dependency Scanning |
| SAST               | ✅ CodeQL           | ✅ SAST                |
| Container scanning | Docker build checks | ✅ Container Scanning  |
| CODEOWNERS         | ✅                  | ✅                     |
| Branch protection  | ✅                  | ✅                     |
| Scorecard          | ✅                  | ❌                     |

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
