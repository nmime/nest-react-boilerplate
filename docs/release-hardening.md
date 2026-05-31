# Release and Kubernetes hardening

## Image immutability

Release images are built by `.github/workflows/release-images.yml` and pushed to
GHCR as `ghcr.io/<owner>/<repo>/<image>:sha-<git-sha>`. The workflow also emits
BuildKit provenance/SBOM attestations, uploads SPDX SBOM artifacts, scans image
digests with Trivy, and signs pushed digests with cosign keyless signing via
GitHub OIDC.

Production Helm values intentionally avoid `latest`. Prefer setting
`*.image.digest` to the pushed digest, or set every `*.image.tag` to the
workflow's `sha-<git-sha>` tag.

## Helm validation

Run the same render gate as CI:

```bash
bash scripts/validate-helm.sh
# or
pnpm run helm:validate
```

The gate renders default and production values, rejects `:latest` in production,
and verifies nginx frontends point at Kubernetes Service DNS names.

## Runtime port and nginx behavior

API containers use their per-app Helm `apps.<name>.port` value as both
`containerPort` and the `PORT` environment variable, overriding the Dockerfile's
compose-friendly `PORT=3000`. Services continue to expose `servicePort: 3000` and
route by named target port.

Frontend images still include the docker-compose nginx config for local use. In
Kubernetes, Helm mounts a rendered ConfigMap at
`/etc/nginx/conf.d/default.conf`; upstreams resolve to
`<release>-auth-api`, `<release>-user-api`, and `<release>-admin-api` Services.
