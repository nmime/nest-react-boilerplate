# GitOps Deployment Guide

This document describes the GitOps deployment pipeline for the Nest React Boilerplate project.

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐     ┌─────────────────┐
│  Code Push  │ ──► │  CI (Gate)   │ ──► │  Deploy Workflow   │ ──► │  ArgoCD Sync    │
│  to main    │     │  ci.yml      │     │  deploy.yml        │     │  (automatic)    │
└─────────────┘     └──────────────┘     └────────────────────┘     └────────┬────────┘
                                                                              │
                                                                    ┌─────────▼────────┐
                                                                    │  Kubernetes      │
                                                                    │  Cluster         │
                                                                    └─────────────────┘
```

## The Pipeline

### 1. Code Change (Developer)

A developer opens a PR against `main`. The PR can modify application code in `apps/`,
Helm chart files in `.helm/`, the `Dockerfile`, or `pnpm-lock.yaml`.

### 2. CI Gate (`.github/workflows/ci.yml`)

On PR and push to `main`, the CI workflow runs:

- Linting, type-checking, and tests
- Helm chart rendering validation
- Security scanning (CodeQL, scorecards)
- Dependency review on PRs

**The pipeline will not deploy if CI fails.**

### 3. Image Build (`.github/workflows/release-images.yml`)

On tags (`v*`) and GitHub releases, the release workflow:

- Builds all 9 container images (migrator, 3 APIs, 5 frontends)
- Runs Trivy security scans
- Signs images with cosign (SLSA provenance)
- Pushes images to `ghcr.io/nmime/nest-react-boilerplate/*`

### 4. Deploy Workflow (`.github/workflows/deploy.yml`)

On push to `main` (triggered by app code or chart changes):

1. **Check out the repo** with a deploy token (`GH_DEPLOY_TOKEN`)
2. **Determine the git SHA** (HEAD by default, or a manual override via `workflow_dispatch`)
3. **Update image tags** in `deploy/k8s/values.yaml` via `scripts/update-deploy-tags.py`
   - Every `tag: "sha-xxxxxxx"` line is updated to the current commit short SHA
4. **Validate** the Helm chart renders correctly with the updated values
5. **Commit and push** the updated `deploy/k8s/values.yaml` back to `main`
6. **ArgoCD auto-syncs** because `targetRevision: main` and `automated.selfHeal: true`

### 5. ArgoCD Sync (Automatic)

ArgoCD watches `main` branch of the repo. When `deploy/k8s/values.yaml` changes:

- ArgoCD detects drift between the cluster state and the desired state
- It automatically reconciles: updating Deployments, which triggers rolling restarts
- New pods pull the updated image tags from GHCR

## File Structure

```
.
├── .helm/                          # Helm chart (source of truth for templates)
│   ├── Chart.yaml
│   ├── values.yaml                 # Default values
│   ├── values-production.yaml      # Production overrides (base config)
│   └── templates/                  # K8s manifests
├── deploy/
│   ├── k8s/
│   │   ├── argocd-application.yaml # ArgoCD Application resource (install this)
│   │   └── values.yaml             # LIVE values — updated by deploy workflow
│   └── argocd/
│       └── application.yaml        # Legacy/example (may be removed)
├── scripts/
│   └── update-deploy-tags.py       # Updates image tags in deploy/k8s/values.yaml
├── .github/workflows/
│   ├── ci.yml                      # CI gate
│   ├── deploy.yml                  # GitOps deploy (updates values.yaml)
│   ├── release-images.yml          # Build & push images on tags/releases
│   └── argo-sync.yml              # Manual ArgoCD sync trigger
└── GITOPS.md                       # This file
```

## Setting Up ArgoCD on Your Cluster

### Prerequisites

- A Kubernetes cluster with ArgoCD installed
- The `argocd` namespace exists with ArgoCD running
- An `imagePullSecret` named `ghcr-credentials` in the target namespace for pulling from GHCR

### Install the ArgoCD Application

Apply the ArgoCD Application resource to your cluster:

```bash
kubectl apply -f deploy/k8s/argocd-application.yaml
```

This creates an ArgoCD Application that:

- Points to the repo's `.helm/` directory as a Helm chart source
- Uses `deploy/k8s/values.yaml` as an overlay values file
- Auto-syncs on changes with prune and self-heal enabled
- Creates the `nest-react-boilerplate` namespace if it doesn't exist

### Verify the Application

```bash
# Check application status
argocd app get nest-react-boilerplate

# Watch sync status
argocd app wait nest-react-boilerplate --health

# View the sync history
argocd app history nest-react-boilerplate
```

## Required Secrets

### GitHub Repository Secrets

| Secret | Purpose | Required For |
|--------|---------|-------------|
| `GH_DEPLOY_TOKEN` | PAT with repo write access for the deploy workflow to push changes | `deploy.yml` |
| `ARGOCD_SERVER` | ArgoCD server URL (e.g., `https://argocd.example.com`) | `argo-sync.yml` |
| `ARGOCD_AUTH_TOKEN` | ArgoCD auth token for CLI authentication | `argo-sync.yml` |

### Kubernetes Secrets

| Secret | Purpose |
|--------|---------|
| `ghcr-credentials` | Docker pull secret for `ghcr.io` |
| `nest-react-boilerplate-production-secrets` | App secrets (JWT keys, DB passwords, etc.) |
| `nest-react-boilerplate-tls` | TLS certificate (auto-provisioned by cert-manager) |
| `nest-react-boilerplate-backup-object-store` | S3/Object store credentials for backups |
| `nest-react-boilerplate-backup-encryption` | Age encryption recipient for backups |

### Creating the GHCR Pull Secret

```bash
kubectl create secret docker-registry ghcr-credentials \
  --namespace nest-react-boilerplate \
  --docker-server=ghcr.io \
  --docker-username=<GITHUB_USERNAME> \
  --docker-password=<GITHUB_TOKEN> \
  --docker-email=<EMAIL>
```

## Manual Operations

### Manual Deploy (Specific Commit)

```bash
# Trigger the deploy workflow with a specific SHA
# Go to: Actions > Deploy to cluster > Run workflow
# Enter the git SHA in the input field
```

### Force ArgoCD Sync

```bash
# Via the argo-sync.yml workflow
# Go to: Actions > Sync ArgoCD > Run workflow
# Choose "Force sync" if the cluster state diverged

# Or via argocd CLI:
argocd app sync nest-react-boilerplate --force --grpc-web
```

### Rollback to Previous Version

```bash
# Option 1: ArgoCD rollback (reverts to previous sync)
argocd app rollback nest-react-boilerplate <revision-number> --grpc-web

# Option 2: Revert the deploy commit in git
git revert HEAD --no-edit
git push origin main

# Option 3: Manually edit deploy/k8s/values.yaml to the previous tag
# Then commit and push — ArgoCD will auto-sync
```

### Emergency: Disable Auto-Sync

```bash
# Patch the ArgoCD application to disable auto-sync
kubectl patch application nest-react-boilerplate -n argocd \
  --type merge \
  --patch '{"spec":{"syncPolicy":{"automated":null}}}'

# Re-enable when ready
kubectl apply -f deploy/k8s/argocd-application.yaml
```

## Customizing Domains and Hosts

Edit `deploy/k8s/values.yaml` under the `ingress` section:

```yaml
ingress:
  tls:
    - secretName: nest-react-boilerplate-tls
      hosts:
        - mydomain.com
        - site.mydomain.com
        - app.mydomain.com
        - mobile.mydomain.com
        - admin.mydomain.com
        - auth.mydomain.com
```

Update `config.corsOrigins` to match your frontend domains:

```yaml
config:
  corsOrigins: https://admin.mydomain.com,https://app.mydomain.com,...
  authJwtIssuer: https://auth.mydomain.com
```

After making changes, commit and push to `main`. The deploy workflow will update
image tags, and ArgoCD will sync the new ingress configuration.

## Troubleshooting

### ArgoCD shows "OutOfSync" but not deploying

```bash
# Check what's different
argocd app diff nest-react-boilerplate --grpc-web

# Check if the imagePullSecret exists
kubectl get secret ghcr-credentials -n nest-react-boilerplate

# Check pod events for image pull errors
kubectl get pods -n nest-react-boilerplate -o wide
kubectl describe pod <pod-name> -n nest-react-boilerplate
```

### Deploy workflow fails to push

Ensure `GH_DEPLOY_TOKEN` is a Personal Access Token (classic or fine-grained) with:
- `Contents: Read and write` permissions
- `Workflows: Read and write` permissions (to avoid blocking the workflow from its own push)

### Helm template validation fails

```bash
# Run locally to debug
helm template nest-react-boilerplate .helm \
  -f .helm/values.yaml \
  -f deploy/k8s/values.yaml
```

## Images

The multi-target Dockerfile builds these 9 images:

| Service | Image Path |
|---------|-----------|
| Database Migrator | `ghcr.io/nmime/nest-react-boilerplate/migrator` |
| Auth API | `ghcr.io/nmime/nest-react-boilerplate/auth-app-api` |
| User API | `ghcr.io/nmime/nest-react-boilerplate/user-app-api` |
| Admin API | `ghcr.io/nmime/nest-react-boilerplate/admin-app-api` |
| Admin Frontend | `ghcr.io/nmime/nest-react-boilerplate/admin-app` |
| User Frontend | `ghcr.io/nmime/nest-react-boilerplate/user-app` |
| Landing Page | `ghcr.io/nmime/nest-react-boilerplate/landing-app` |
| Site (Marketing) | `ghcr.io/nmime/nest-react-boilerplate/site-app` |
| Mobile Frontend | `ghcr.io/nmime/nest-react-boilerplate/mobile-app` |
