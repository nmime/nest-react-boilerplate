# Dependency and supply-chain management

Use this policy to keep dependency updates low-risk and reproducible.

## Package updates

- Keep `pnpm-lock.yaml` committed and install with `pnpm install --frozen-lockfile` in CI and release builds.
- Prefer grouped minor/patch Dependabot PRs for routine updates; review major updates one ecosystem at a time.
- Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:coverage`, and `pnpm run audit` before merging dependency PRs.
- Regenerate API contracts/clients only when dependency changes affect generated output, then commit the generated diff in the same PR.

## Build scripts

This repository intentionally allows native build steps only for packages required by the current toolchain:

- `@nestjs/core`
- `@parcel/watcher`
- `@swc/core`
- `esbuild`
- `nx`

Unexpected new package build scripts should be treated as a supply-chain review item. Approve them only when the package is necessary, the install script is documented, and CI still uses the frozen lockfile.

## GitHub Actions

- Pin third-party and first-party GitHub Actions to full 40-character commit SHAs in workflow `uses:` entries.
- Keep the human-readable version tag in a trailing comment (for example, `# v4`) so Dependabot action updates remain easy to review.
- Prefer pinned runner images such as `ubuntu-24.04` over floating labels such as `ubuntu-latest` for CI and release reproducibility.

## Security gates

- Pull requests run Dependency Review and fail on moderate-or-higher vulnerable dependency additions.
- Mainline/release workflows run CodeQL, `pnpm audit`, container SBOM generation, Trivy scanning, and keyless image signing.
- Production image tags should be immutable (`sha-<git sha>` or digest) and tied back to the release commit.
