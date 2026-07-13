# Supply Chain Security

Supply-chain posture, SLSA alignment, SBOM generation, and dependency management for the Nest React Boilerplate platform.

## SLSA 3 status

[SLSA](https://slsa.dev/) (Supply-chain Levels for Software Artifacts) defines a framework for securing the software supply chain. Here is where this repository stands:

| SLSA 3 Requirement | Status | Details |
|--------------------|--------|---------|
| **Build authenticity** | ✅ Implemented | Builds run in GitHub Actions with pinned action SHAs, frozen lockfile (`--frozen-lockfile`), and pinned runner images (`ubuntu-22.04`). |
| **Build provenance** | ✅ Implemented | `docker/build-push-action` emits `provenance: mode=max` (SLSA 1 provenance via in-toto attestation) for every image. |
| **Build reproducibility** | ⚠️ Partial | Dockerfile is multi-stage with explicit base images, but `pnpm install` is not fully deterministic (network fetches). Recommend: pnpm cachedir volume + `--frozen-lockfile` (already done). |
| **Source integrity** | ✅ Implemented | Source is hosted on GitHub with branch protection. PRs require reviews and pass CI gates. |
| **Dependency review** | ✅ Implemented | `dependency-review.yml` runs `pnpm audit` on every PR. Workspace overrides pin vulnerable transitive versions. |
| **SBOM generation** | ✅ Implemented | `anchore/sbom-action` generates SPDX JSON for every container image in the release workflow. |
| **Vulnerability scanning** | ✅ Implemented | Trivy scans images for CRITICAL/HIGH vulnerabilities; fails the build on findings. CodeQL scans source on every PR. |
| **Image signing** | ✅ Implemented | `sigstore/cosign-installer` + keyless signing via GitHub OIDC on every release image. |
| **SLSA provenance attestation** | ⚠️ Partial | Docker Buildx `provenance: mode=max` emits SLSA 1 provenance. Full SLSA 3 requires a hermetic build with `slsa-framework/slsa-github-generator`. |
| **Workflow protection** | ⚠️ Partial | Workflows use `permissions: contents: read` (least privilege), but workflow edits are not protected by additional approval gates. |

### What's missing for full SLSA 3

1. **Hermetic build environment** — Replace `pnpm install` with a build that uses a local content-addressable store (pnpm's `--dir` cache mount) to eliminate network fetches during CI.
2. **SLSA 3 provenance generator** — Swap `docker/build-push-action` provenance for `slsa-framework/slsa-github-generator` which emits SLSA 3 provenance attestations.
3. **Workflow pinning** — Add `workflow_approvals` for changes to `.github/workflows/` (GitHub Enterprise feature) or use `protect-me` bot.
4. **Branch protection on release tags** — Enforce that only trusted CI creates version tags (tag protection rules).

## SBOM generation

### Using Syft (local / ad-hoc)

Install [Syft](https://github.com/anchore/syft) and run against your built image:

```bash
# Against a local Docker image
syft ghcr.io/your-org/nest-react-boilerplate/admin-app-api:sha-$(git rev-parse HEAD) \
  --output spdx-json > sbom-admin-app-api.spdx.json

# Against a directory (source SBOM)
syft ./apps/backend/admin/admin-app-api \
  --source-name admin-app-api \
  --source-version $(git rev-parse --short HEAD) \
  --output cyclonedx-json > sbom-admin-app-api.cdx.json
```

### In CI (release-images.yml)

The release workflow generates SBOMs automatically:

```yaml
- name: Generate SBOM artifact
  uses: anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610
  with:
    image: ${{ env.IMAGE_PREFIX }}/${{ matrix.name }}@${{ steps.build.outputs.digest }}
    format: spdx-json
    output-file: sbom-${{ matrix.name }}.spdx.json
```

SBOM artifacts are uploaded per-service. Download them from the workflow run artifacts tab.

### Storing SBOMs

For compliance, push SBOMs to your artifact registry:

```bash
# Example: upload to S3
aws s3 cp sbom-admin-app-api.spdx.json \
  s3://sbom-bucket/nest-react-boilerplate/admin-app-api/$(git rev-parse HEAD).spdx.json

# Or push to Sigstore's Fulcio/Rekor for public attestation
cosign attach sbom --sbom sbom-admin-app-api.spdx.json \
  ghcr.io/your-org/nest-react-boilerplate/admin-app-api@sha256:<digest>
```

## pnpm supply-chain quarantine

`pnpm-workspace.yaml` enforces supply-chain protections:

### Version quarantine

```yaml
# Reject packages published less than 24 hours ago
quarantine: 1d
```

This prevents "0-day" malicious packages from being installed. If a critical security patch was just published, override temporarily:

```bash
# Bypass quarantine for a specific package
pnpm install --no-quarantine some-package
# Or temporarily:
pnpm config set quarantine 0s
```

### Workspace overrides

Critical transitive dependencies are pinned to safe versions in `pnpm-workspace.yaml`:

| Package | Pinned to | Reason |
|---------|-----------|--------|
| `better-auth` | `1.6.23` | Multiple CVEs in `1.4.21` |
| `drizzle-orm` | `0.45.2` | SQL injection in `0.41.0` |
| `typescript` | `6.0.3` | Workspace consistency until NestJS/Nx support TS 7 |
| `follow-redirects` | security-pinned | CVE in older versions |
| `axios` | security-pinned | Multiple CVEs in older versions |
| `ws` | security-pinned | Remote code execution in older versions |

### .npmrc settings

```ini
engine-strict=true           # Fail if Node version doesn't match engines field
package-manager-strict=true  # Fail if pnpm version doesn't match packageManager field
```

These prevent accidental installs with incompatible toolchain versions that might pull different dependency resolutions.

## Dependabot configuration

Dependabot runs automated dependency updates with grouped PRs:

| Grouping | Schedule | Packages |
|----------|----------|----------|
| `npm-minor-patch` | Daily | All npm packages (minor + patch) |
| `npm-major` | Weekly | All npm packages (major) |
| `github-actions` | Weekly | GitHub Actions versions |
| `docker` | Weekly | Docker base images |

Dependabot PRs are labeled `dependencies` and prefixed with `ci:`. All PRs must pass the full CI gate before merging.

### Updating Dependabot groupings

Edit `.github/dependabot.yml` to add/remove groupings or change schedules. Keep groupings coarse enough to avoid PR spam, but fine enough that major updates are reviewable individually.

## CI gates for supply chain

| Workflow | Gate | What it checks |
|----------|------|----------------|
| `dependency-review.yml` | `Supported lockfile audit` | `pnpm audit` on production deps; fails on moderate+ |
| `ci.yml` | `Native security gates` | Secret scanning, SAST |
| `codeql.yml` | `Analyze JavaScript/TypeScript` | CodeQL semantic analysis |
| `release-images.yml` | `Trivy vulnerability scan` | Container image vuln scan (CRITICAL, HIGH) |
| `release-images.yml` | `Cosign keyless sign` | Image signing attestation |

## Recommendations

### Image signing with Sigstore/cosign

Already implemented in `release-images.yml`. To verify images locally:

```bash
# Verify a signed image
cosign verify --yes \
  --certificate-identity-regexp='.*' \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  ghcr.io/your-org/nest-react-boilerplate/admin-app-api@sha256:<digest>

# Verify with keyless (default for GitHub OIDC)
cosign verify ghcr.io/your-org/nest-react-boilerplate/admin-app-api:sha-$(git rev-parse HEAD)
```

### SLSA provenance in release workflow

To move from SLSA 1 to SLSA 3 provenance, replace the build-push step with the SLSA framework generator:

```yaml
- name: Build and publish (SLSA 3)
  uses: slsa-framework/slsa-github-generator/.github/workflows/builder_go_slsa3.yml@v2.0.0
  with:
    base64-provenance: build_and_publish.slsa.provenance
    upload-assets: false
    # Or use the Docker-specific builder
```

### Additional hardening

1. **Tag protection** — Require tag creation through the release workflow only (no manual `git push origin vX.Y.Z`).
2. **Renovate as Dependabot alternative** — Renovate offers more granular grouping, automerge policies, and better monorepo support.
3. **Artifact attestation** — Use GitHub's native artifact attestation (`gh attestation`) alongside cosign for dual verification.
4. **Supply chain transparency** — Publish SBOMs to a public endpoint (e.g., GitHub releases assets) for downstream consumers.
