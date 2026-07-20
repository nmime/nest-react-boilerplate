# Dependency and supply-chain management

Use this policy to keep dependency updates low-risk and reproducible.

## Compatibility matrix

| Constraint | Version | Rationale                                                                       |
| ---------- | ------- | ------------------------------------------------------------------------------- |
| Node.js    | 24.18.0 | Current Node 24 LTS baseline; engines accept `>=24 <25`                         |
| pnpm       | 11.11.0 | Workspace packageManager field; Docker aligned                                  |
| TypeScript | 6.0.3   | Pinned until NestJS/Nx support TS 7; workspace override enforces single version |
| React      | 19.2.3  | All frontend apps and libs; matches the Expo 57 supported runtime               |
| Nx         | 23.1.0  | All @nx/* packages aligned                                                      |
| Vitest     | 4.1.10  | All workspace consumers                                                         |
| Vite       | 8.1.5   | All workspace consumers                                                         |
| Astro      | 7.1.0   | Landing app and generated Astro applications                                    |
| Expo SDK   | 57.0.x  | Mobile app (Babel 7.x required — Babel 8 deferred until Expo compatibility)     |

## Package updates

- Keep `pnpm-lock.yaml` committed and install with `pnpm install --frozen-lockfile` in CI and release builds.
- pnpm's implicit dependency reconciliation is disabled with `verifyDepsBeforeRun: false` in `pnpm-workspace.yaml`. Run `pnpm install` explicitly when manifests change; ordinary scripts must not mutate `node_modules` or the lockfile.
- Prefer grouped minor/patch Dependabot PRs for routine updates; review major updates one ecosystem at a time.
- Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:coverage`, and `pnpm run audit` before merging dependency PRs.
- Regenerate API contracts/clients only when dependency changes affect generated output, then commit the generated diff in the same PR.

## Version alignment rules

All workspace manifests must use the same version for shared direct dependencies unless a documented constraint requires otherwise. Drift is caught by the drift-check script and must be resolved before merging.

### pnpm workspace overrides

`pnpm-workspace.yaml` enforces single versions for security-critical and widely-used packages:

- `better-auth`: pinned to **1.6.23** — overrides the stale `@better-auth/cli@1.4.21` transitive dependency to prevent installing `better-auth@1.4.21` (multiple CVEs). Single version enforced.
- `drizzle-orm`: pinned to **0.45.2** — overrides the stale CLI transitive to prevent SQL injection in `drizzle-orm@0.41.0`. Single version enforced.
- `typescript`: pinned to **6.0.3** across all workspaces until NestJS/Nx support TS 7.
- `rxjs`, `tslib`, NestJS core/platform packages, `lodash`, `brace-expansion`, `picomatch`, `path-to-regexp`, `serialize-javascript`, `postcss`, `follow-redirects`, `axios`, `fast-uri`, `svgo`, `js-yaml`, `yaml`, `ajv`, `ws`, `tmp`, `uuid`, `qs`, `undici`, `happy-dom`, `esbuild`, `form-data`, `http-proxy-middleware`, `@opentelemetry/core`, `multer`: all security-pinned per advisory.

## Deferred major updates

| Package               | Current | Latest | Blocker                                                     | Revisit trigger                                      |
| --------------------- | ------- | ------ | ----------------------------------------------------------- | ---------------------------------------------------- |
| TypeScript            | 6.0.3   | 7.x    | typescript-eslint 8.64 declares TypeScript `<6.1.0`         | typescript-eslint release with a TS 7 peer range     |
| Babel                 | 7.29.x  | 8.x    | Rollup, Jest, and Babel 7 plugins reject Babel 8            | All Babel consumers publish Babel 8 peer ranges      |
| @fastify/static       | 9.3.0   | 10.x   | NestJS 11 platform and Swagger accept only 8.x or 9.x       | NestJS releases with @fastify/static 10 peer support |
| @types/node           | 24.13.3 | 26.x   | Node 24 runtime; type definitions match the runtime major   | Runtime upgrade to Node 26                           |
| React / React DOM     | 19.2.3  | 19.2.7 | Expo SDK 57 requires exactly 19.2.3                         | Expo package matrix moves to the newer patch         |
| gesture-handler       | 2.32.0  | 3.0.2  | Expo SDK 57 requires `~2.32.0`                              | Expo package matrix includes 3.x                     |
| reanimated            | 4.5.0   | 4.5.2  | Expo SDK 57 requires exactly 4.5.0                          | Expo package matrix moves to the newer patch         |
| safe-area-context     | 5.7.0   | 5.8.0  | Expo SDK 57 requires `~5.7.0`                               | Expo package matrix moves to 5.8.x                   |
| react-native-screens  | 4.25.2  | 4.26.2 | Expo SDK 57 requires exactly 4.25.2                         | Expo package matrix moves to 4.26.x                  |
| react-native-worklets | 0.10.0  | 0.11.x | Expo SDK 57 requires 0.10.0 in its supported package matrix | Expo package matrix includes 0.11.x                  |

## Build scripts

This repository intentionally allows native build steps only for packages required by the current toolchain:

- `@nestjs/core`
- `@parcel/watcher`
- `@prisma/client`
- `@swc/core`
- `better-sqlite3`
- `esbuild`
- `nx`
- `sharp`

Unexpected new package build scripts should be treated as a supply-chain review item. Approve them only when the package is necessary, the install script is documented, and CI still uses the frozen lockfile.

## GitHub Actions

- Pin third-party and first-party GitHub Actions to full 40-character commit SHAs in workflow `uses:` entries.
- Keep the human-readable version tag in a trailing comment (for example, `# v4`) so Dependabot action updates remain easy to review.
- Prefer pinned runner images such as `ubuntu-22.04` over floating labels such as `ubuntu-latest` for CI and release reproducibility.

## Security gates

- Pull requests run Dependency Review and fail on moderate-or-higher vulnerable dependency additions.
- Mainline/release workflows run CodeQL, `pnpm audit`, container SBOM generation, Trivy scanning, and keyless image signing.
- Production releases should record the image digest and may also use the
  commit-addressed `sha-<git-sha>` tag. Protect tags from mutation; the digest,
  not the tag's spelling, is the immutable artifact identity.

## Docker image pinning

Bundled service images use explicit version tags rather than `latest` or
floating major-only tags. These tags improve reviewability but are still
registry-mutable; pin digests as well if the product requires immutable base
image resolution.

| Service    | Pinned tag                     | Source                   |
| ---------- | ------------------------------ | ------------------------ |
| PostgreSQL | `17.6-alpine`                  | Docker Hub `postgres`    |
| Redis      | `7.4.3-alpine`                 | Docker Hub `redis`       |
| NATS       | `2.10.25-alpine`               | Docker Hub `nats`        |
| MinIO      | `RELEASE.2025-09-07T16-13-09Z` | Docker Hub `minio/minio` |

## Audit results (2026-07-18)

- **Production audit**: 0 vulnerabilities (exit 0)
- **Development audit**: 0 vulnerabilities (exit 0)
- **Peer dependencies**: 0 issues (`pnpm peers check`, exit 0)
- **Frozen lockfile install**: exit 0
- **Registry drift**: only the incompatible major/runtime releases listed above remain intentionally deferred
- **Deduplication**: `better-auth` → 1 version (was 2), `drizzle-orm` → 1 version (was 2)
