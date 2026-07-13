# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).
Version bumps, changelog entries, and git tags are automated by semantic-release via Conventional Commits.

## [Unreleased]

### Fixed
- Docker Node.js version corrected (26 → 24.11.0)
- Site app Docker stage now uses proper build + runtime (no experimental TS stripping)
- Deploy workflow now gated on CI success via `workflow_run` trigger
- CodeQL now uses explicit pnpm build steps instead of `autobuild`
- Added missing NetworkPolicy Helm template (production network segmentation)
- Added startupProbe to all deployments
- HPA scale-down stabilization window (300s)
- PDB changed to `maxUnavailable: 1`
- Migration job TTL for pod cleanup
- Frontend services now have resource limits in production
- Backups enabled in production
- OTEL traces exported to OTLP (Tempo) instead of debug-only
- Cosign `COSIGN_EXPERIMENTAL` removed (deprecated for v4+)
- SSL redirect annotation added to ingress
- Added `.prettierrc` configuration
- Line ending normalization via `.gitattributes`
- Dockerfile excludes docs, .github, .cursor, markdown files

### Added
- Full GitOps CI/CD pipeline with ArgoCD Application
- `deploy/k8s/argocd-application.yaml` — ArgoCD app with auto-sync, prune, selfHeal
- `deploy/k8s/values.yaml` — LIVE production values managed by deploy workflow
- `.github/workflows/deploy.yml` — CI-gated deployment workflow
- `.github/workflows/argo-sync.yml` — manual ArgoCD force-sync
- `scripts/update-deploy-tags.py` — image tag updater with SHA validation + dry-run
- `GITOPS.md` — comprehensive GitOps documentation
- 1,139-line production deployment runbook in ansible-k8s-full-setup
- Dependabot assignees and reviewers configured

### Removed
- `roles/brocoders-boilerplate-setup/` from ansible-k8s-full-setup
- All brocoders references from platform documentation

## [0.1.0] - 2025-07-01

### Added
- Initial release of NestJS + React boilerplate
- Nx monorepo with 41 projects (6 backend apps, 3 frontend apps, 27+ libs)
- Full authentication system (JWT, refresh tokens, Telegram, Discord OAuth)
- Multi-stage Docker builds with SBOM, Trivy scanning, Cosign signing
- Helm chart with production-ready values
- Comprehensive CI/CD: CI gate, CodeQL, Scorecard, dependency review
- Quality presets: a11y, performance, DAST, chaos, load testing, canary
- 297 test files with Vitest + Playwright
- Testcontainers-based integration testing
- Feature-sliced architecture (FSD) for frontend
- OpenAPI contract management with Spectral linting and fuzzing
