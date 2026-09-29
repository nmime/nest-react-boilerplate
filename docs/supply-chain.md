# Supply Chain Security

Supply-chain posture, SLSA alignment, SBOM generation, and dependency management for the Nest React Boilerplate platform.

**Forge coupling.** The controls in this document are forge-neutral; the
reference implementation is the GitLab pipeline in `.gitlab-ci.yml`. Three
sections describe that implementation rather than the control — [Dependency
update automation](#dependency-update-automation), [CI gates for supply
chain](#ci-gates-for-supply-chain), and the `cosign verify` invocation under
[Image signing with Sigstore/cosign](#image-signing-with-sigstorecosign).
A project on another forge replaces those three and keeps the rest.

## Checked-in provenance and supply-chain posture

[SLSA](https://slsa.dev/) (Supply-chain Levels for Software Artifacts) defines a framework for securing the software supply chain. The table below reports only controls visible in this repository. It does not claim a SLSA level or infer GitHub organization and repository settings that are configured outside Git.

| Control                      | Checked-in status | Evidence or remaining boundary                                                                                                                                                                                        |
| ---------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build inputs**             | Implemented       | CI uses a frozen pnpm lockfile, pinned container images and pipeline includes, and explicit Node/pnpm versions.                                                                                                       |
| **Build provenance**         | Implemented       | The `release-images` job enables Docker Buildx `provenance: mode=max` and addresses every published image by digest after the build.                                                                                  |
| **Build isolation**          | Partial           | Release builds run in GitLab CI jobs, but dependency installation and base-image resolution can use the network. The repository does not claim a hermetic build.                                                      |
| **Source integrity**         | External setting  | Protected branches, required reviews, tag protection, and protected variables are hosting-forge settings. Maintainers must verify them there; checked-in pipeline files cannot prove them.                            |
| **Dependency audit**         | Implemented       | The `dependency-review` job installs the frozen lockfile and runs `pnpm run audit:ci` for production dependencies at the moderate severity threshold.                                                                 |
| **SBOM generation**          | Implemented       | Docker Buildx embeds SBOM metadata and the release job runs Syft to write a separate SPDX JSON artifact for each release image.                                                                                       |
| **Vulnerability scanning**   | Implemented       | Trivy scans every release image for CRITICAL/HIGH OS and library findings with `--exit-code 1`; GitLab's SAST, Dependency, Secret, and Container Scanning templates plus the native secret/SAST gates run separately. |
| **Image signing**            | Implemented       | cosign signs each release image digest through the GitLab CI OIDC identity (`id_tokens: SIGSTORE_ID_TOKEN`).                                                                                                          |
| **Pipeline least privilege** | Partial           | Jobs run under a scoped CI job token; release publishing needs the registry credentials and a Sigstore identity token, and host approval is external.                                                                 |

### Host and build controls still to verify or add

1. **Verify host rules** — confirm protected branches, required reviews and checks, environment approvals, and release-tag restrictions in the hosting forge.
2. **Choose a target SLSA level** — assess the release pipeline against the current SLSA specification and record evidence before claiming conformance.
3. **Reduce mutable build inputs** — pin runner/container images where practical and use immutable base-image digests if the product's release policy requires them.
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

### In CI (the `release-images` job)

The release pipeline generates SBOMs automatically, one SPDX JSON file per
published image digest:

```yaml
- syft "$ref" -o "spdx-json=sboms/sbom-${name}.spdx.json"
```

SBOM artifacts are uploaded per-service. Download them from the pipeline job's
artifacts tab.

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

Critical transitive dependencies are pinned in `pnpm-workspace.yaml` and
reviewed with their supported API line. See the current
[dependency policy and compatibility holds](dependency-management.md#pnpm-workspace-overrides)
for versions, upstream fixes, peer exceptions, and package extensions.

The current workspace suppresses no GHSA advisories. The former `image-size`
exclusions were removed after an upstream patched release became available.

### .npmrc settings

```ini
engine-strict=true           # Fail if Node version doesn't match engines field
package-manager-strict=true  # Fail if pnpm version doesn't match packageManager field
```

These prevent accidental installs with incompatible toolchain versions that might pull different dependency resolutions.

## Dependency update automation

The control is "grouped, scheduled, reviewable dependency updates". The
repository's reference implementation is Dependabot, configured in
`.github/dependabot.yml`; Renovate provides the same groupings and is the
equivalent a product can run on its own forge.

Dependabot runs automated dependency updates with grouped PRs:

| Grouping          | Schedule | Packages                            |
| ----------------- | -------- | ----------------------------------- |
| `npm-minor-patch` | Weekly   | All npm packages (minor + patch)    |
| `nx`              | Weekly   | `nx` and `@nx/*` packages           |
| `nestjs`          | Weekly   | `@nestjs/*` packages                |
| `opentelemetry`   | Weekly   | `@opentelemetry/*` packages         |
| `docker`          | Weekly   | Docker base images (`/`, `/docker`) |

There is no dedicated major-only npm group; major updates surface as individual PRs. npm dependency PRs are labeled `dependencies, security`; npm and Docker updates use the `chore:` commit prefix. Run the final quality gate after development and obtain maintainer approval before each merge.

### Updating dependency-bot groupings

Edit `.github/dependabot.yml` to add/remove groupings or change schedules. Keep groupings coarse enough to avoid PR spam, but fine enough that major updates are reviewable individually.

## CI gates for supply chain

The declared forge and gate inventory are in `scripts/ci/gates.json` and the
pipeline is `.gitlab-ci.yml`. GitHub Actions are not shipped by this template;
historical Action job names and runs do not establish current CI evidence.

| Gate                    | Evidence                                                            |
| ----------------------- | ------------------------------------------------------------------- |
| Dependency audit        | `pnpm run audit:ci` and `pnpm run audit:full`                       |
| Repository scanning     | Secret scanning and SAST tooling, plus declared GitLab scanner jobs |
| Release vulnerabilities | Trivy fails on CRITICAL/HIGH findings                               |
| Digest provenance       | BuildKit provenance, SBOM, and keyless Cosign signing/attestations  |

Validate declared pipeline parity with `pnpm run ci:pipelines:check`. Separately
verify that the host ran the checks for the reviewed SHA before claiming remote
CI success or release readiness.

## Recommendations

### Image signing with Sigstore/cosign

Already implemented in the `release-images` job. To verify images locally:

```bash
# Owner, project, and ref are this boilerplate's identity; a fork substitutes its
# own. See docs/product-identity.md. GitLab's OIDC subject is
# `project_path:<namespace>/<project>:ref_type:<tag|branch>:ref:<ref>`, so the
# certificate identity names the project and the ref rather than a pipeline file.
cosign verify \
  --certificate-identity-regexp='^project_path:<namespace>/<project>:ref_type:(tag|branch):ref:.*$' \
  --certificate-oidc-issuer=https://gitlab.com \
  <registry>/<namespace>/<project>/admin-app-api@sha256:<digest>
```

### Provenance evolution

The current release pipeline emits BuildKit max-mode provenance. If the project adopts a formal SLSA target, select a supported generator for the repository's artifact type and validate the resulting attestation against that target. Do not copy a language-specific reusable pipeline without first confirming that it supports this multi-image Docker build.

### Additional hardening

1. **Tag protection** — Require tag creation through the release pipeline only (no manual `git push origin vX.Y.Z`).
2. **Renovate as Dependabot alternative** — Renovate offers more granular grouping, automerge policies, and better monorepo support.
3. **Verify before promotion** — promote only a digest whose signature, provenance, and scan attestations verify (`cosign verify-attestation --type slsaprovenance1`, `--type spdxjson`, and the scan predicate), not a tag.
4. **Supply chain transparency** — Publish SBOMs to a public endpoint (e.g. the release's artifact store or an OCI artifact) for downstream consumers.
