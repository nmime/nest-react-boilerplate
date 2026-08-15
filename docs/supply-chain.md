# Supply Chain Security

Supply-chain posture, SLSA alignment, SBOM generation, and dependency management for the Nest React Boilerplate platform.

**Forge coupling.** The controls in this document are forge-neutral; the
reference implementation is GitHub Actions. Three sections describe that
implementation rather than the control — [Dependency update
automation](#dependency-update-automation), [CI gates for supply
chain](#ci-gates-for-supply-chain), and the `cosign verify` invocation under
[Image signing with Sigstore/cosign](#image-signing-with-sigstorecosign).
A project on another forge replaces those three and keeps the rest.

## Checked-in provenance and supply-chain posture

[SLSA](https://slsa.dev/) (Supply-chain Levels for Software Artifacts) defines a framework for securing the software supply chain. The table below reports only controls visible in this repository. It does not claim a SLSA level or infer GitHub organization and repository settings that are configured outside Git.

| Control                      | Checked-in status | Evidence or remaining boundary                                                                                                                                                              |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build inputs**             | Implemented       | CI uses a frozen pnpm lockfile, pinned action SHAs, and explicit Node/pnpm versions. Most jobs use `ubuntu-22.04`; the Gitleaks and release-note jobs still use `ubuntu-latest`.            |
| **Build provenance**         | Implemented       | `release-images.yml` enables Docker Buildx `provenance: mode=max` and addresses every published image by digest after the build.                                                            |
| **Build isolation**          | Partial           | Release builds run in GitHub-hosted jobs, but dependency installation and base-image resolution can use the network. The repository does not claim a hermetic build.                        |
| **Source integrity**         | External setting  | Branch protection, required reviews, tag protection, and rulesets are GitHub settings. Maintainers must verify them in repository settings; checked-in workflow files cannot prove them.    |
| **Dependency audit**         | Implemented       | `dependency-review.yml` installs the frozen lockfile and runs `pnpm run audit:ci` for production dependencies at the moderate severity threshold.                                           |
| **SBOM generation**          | Implemented       | Docker Buildx embeds SBOM metadata and `anchore/sbom-action` uploads a separate SPDX JSON artifact for each release image.                                                                  |
| **Vulnerability scanning**   | Implemented       | Trivy scans every release image for CRITICAL/HIGH OS and library findings with `exit-code: '1'`; CodeQL and native secret/SAST gates run separately.                                        |
| **Image signing**            | Implemented       | `sigstore/cosign-installer` signs each release image digest through GitHub OIDC.                                                                                                            |
| **Workflow least privilege** | Partial           | Workflows declare scoped permissions and actions are SHA-pinned. Release publishing grants package, identity-token, security-event, and attestation permissions; host approval is external. |

### Host and build controls still to verify or add

1. **Verify host rules** — confirm branch protection/rulesets, required reviews and checks, environment approvals, and release-tag restrictions in GitHub.
2. **Choose a target SLSA level** — assess the release workflow against the current SLSA specification and record evidence before claiming conformance.
3. **Reduce mutable build inputs** — pin runner images where practical and use immutable base-image digests if the product's release policy requires them.
4. **Add hermetic controls if required** — prefetch and verify dependencies/base images, then prevent network access during the actual build step.

## SBOM generation

### Using Syft (local / ad-hoc)

Install [Syft](https://github.com/anchore/syft) and run against your built image:

```bash
# Against a local Docker image
syft ghcr.io/nmime/nest-react-boilerplate/admin-app-api:sha-$(git rev-parse HEAD) \
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

# Or upload to the product's registry/compliance store using its documented
# OCI-artifact or signed-attestation policy.
```

Do not describe a raw SBOM attachment as a transparency-log attestation. If the
product requires signed SBOM attestations, pin a current cosign release and add
the matching `attest`/`verify-attestation` commands plus policy tests as one
change.

## pnpm supply-chain quarantine

`pnpm-workspace.yaml` enforces supply-chain protections:

### Version quarantine

```yaml
# Reject versions published less than a day ago (1440 minutes = 24 hours)
minimumReleaseAge: 1440
```

This delays newly published versions and reduces immediate exposure to a
compromised release; it is not a substitute for audit and review. If a critical
security patch was just published, prefer adding the reviewed `pkg@version` to
`minimumReleaseAgeExclude` instead of weakening the repository-wide delay:

```yaml
minimumReleaseAgeExclude:
  # Explicitly reviewed newly-published version allowed through the quarantine
  - 'some-package@1.2.3'
```

### Workspace overrides

Critical transitive dependencies are pinned to safe versions in `pnpm-workspace.yaml`:

| Package            | Pinned to       | Reason                                             |
| ------------------ | --------------- | -------------------------------------------------- |
| `@fastify/static`  | `10.1.2`        | CVE-2026-7120 and CVE-2026-15074                   |
| `better-auth`      | `1.6.23`        | Multiple CVEs in `1.4.21`                          |
| `brace-expansion`  | `5.0.9`         | CVE-2026-14257                                     |
| `drizzle-orm`      | `0.45.2`        | SQL injection in `0.41.0`                          |
| `js-yaml`          | `5.2.2`         | GHSA-pm4m-ph32-ghv5                                |
| `typescript`       | `6.0.3`         | Workspace consistency until NestJS/Nx support TS 7 |
| `follow-redirects` | security-pinned | CVE in older versions                              |
| `axios`            | security-pinned | Multiple CVEs in older versions                    |
| `ws`               | security-pinned | Remote code execution in older versions            |

### .npmrc settings

```ini
engine-strict=true           # Fail if Node version doesn't match engines field
package-manager-strict=true  # Fail if pnpm version doesn't match packageManager field
```

These prevent accidental installs with incompatible toolchain versions that might pull different dependency resolutions.

## Dependency update automation

The control is "grouped, scheduled, reviewable dependency updates". The
reference implementation is Dependabot; Renovate is the equivalent on GitLab
and provides the same groupings.

Dependabot runs automated dependency updates with grouped PRs:

| Grouping          | Schedule | Packages                            |
| ----------------- | -------- | ----------------------------------- |
| `npm-minor-patch` | Weekly   | All npm packages (minor + patch)    |
| `nx`              | Weekly   | `nx` and `@nx/*` packages           |
| `nestjs`          | Weekly   | `@nestjs/*` packages                |
| `opentelemetry`   | Weekly   | `@opentelemetry/*` packages         |
| `github-actions`  | Weekly   | GitHub Actions versions             |
| `docker`          | Weekly   | Docker base images (`/`, `/docker`) |

There is no dedicated major-only npm group; major updates surface as individual PRs. npm dependency PRs are labeled `dependencies, security` and use the `deps:` commit prefix (github-actions uses `ci:`, docker uses `docker:`). All PRs must pass the full CI gate before merging.

### Updating dependency-bot groupings

Edit `.github/dependabot.yml` to add/remove groupings or change schedules. Keep groupings coarse enough to avoid PR spam, but fine enough that major updates are reviewable individually.

## CI gates for supply chain

| Workflow                | Gate                            | What it checks                                      |
| ----------------------- | ------------------------------- | --------------------------------------------------- |
| `dependency-review.yml` | `Supported lockfile audit`      | `pnpm audit` on production deps; fails on moderate+ |
| `ci.yml`                | `Fast PR gate (ci:pr)`          | Secret scanning, SAST (already inside `ci:pr`)      |
| `codeql.yml`            | `Analyze JavaScript/TypeScript` | CodeQL semantic analysis                            |
| `release-images.yml`    | `Trivy vulnerability scan`      | Container image vuln scan (CRITICAL, HIGH)          |
| `release-images.yml`    | `Cosign keyless sign`           | Image signing attestation                           |

## Recommendations

### Image signing with Sigstore/cosign

Already implemented in `release-images.yml`. To verify images locally:

```bash
# Verify a signed image
cosign verify \
  # Owner and repository are this boilerplate's identity; a fork substitutes
  # its own. See docs/product-identity.md.
  --certificate-identity-regexp='^https://github\.com/nmime/nest-react-boilerplate/\.github/workflows/release-images\.yml@refs/(tags/v.*|heads/main)$' \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  ghcr.io/nmime/nest-react-boilerplate/admin-app-api@sha256:<digest>
```

### Provenance evolution

The current release workflow emits BuildKit max-mode provenance. If the project adopts a formal SLSA target, select a supported generator for the repository's artifact type and validate the resulting attestation against that target. Do not copy a language-specific reusable workflow without first confirming that it supports this multi-image Docker build.

### Additional hardening

1. **Tag protection** — Require tag creation through the release workflow only (no manual `git push origin vX.Y.Z`).
2. **Renovate as Dependabot alternative** — Renovate offers more granular grouping, automerge policies, and better monorepo support.
3. **Artifact attestation** — Use GitHub's native artifact attestation (`gh attestation`) alongside cosign for dual verification.
4. **Supply chain transparency** — Publish SBOMs to a public endpoint (e.g., GitHub releases assets) for downstream consumers.
