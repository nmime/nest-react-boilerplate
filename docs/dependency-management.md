# Dependency and supply-chain management

Use this policy to keep dependency updates low-risk and reproducible.

## Compatibility matrix

| Constraint | Version | Rationale                                                                       |
| ---------- | ------- | ------------------------------------------------------------------------------- |
| Node.js    | 24.18.0 | Current Node 24 LTS baseline; engines accept `>=24 <25`                         |
| pnpm       | 11.11.0 | Workspace packageManager field; Docker aligned                                  |
| TypeScript | 6.0.3   | Pinned until NestJS/Nx support TS 7; workspace override enforces single version |
| React      | 19.2.7  | All frontend apps and libs                                                      |
| Nx         | 23.1.0  | All @nx/* packages aligned                                                      |
| Vitest     | 4.1.10  | All workspace consumers                                                         |
| Vite       | 8.1.4   | All workspace consumers                                                         |
| Astro      | 7.0.9   | Landing app and generated Astro applications                                    |
| Expo SDK   | 57.0.x  | Mobile app (Babel 7.x required — Babel 8 deferred until Expo compatibility)     |

## Package updates

- Keep `pnpm-lock.yaml` committed and install with `pnpm install --frozen-lockfile` in CI and release builds.
- pnpm's implicit dependency reconciliation is disabled with `verifyDepsBeforeRun: false` in `pnpm-workspace.yaml`. Run `pnpm install` explicitly when manifests change; ordinary scripts must not mutate `node_modules` or the lockfile.
- Prefer grouped minor/patch Dependabot PRs for routine updates; review major updates one ecosystem at a time.
- Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:coverage`, and `pnpm run audit` before merging dependency PRs.
- Regenerate API contracts/clients only when dependency changes affect generated output, then commit the generated diff in the same PR.

## Version alignment rules

All 15 workspace manifests must use the same version for shared direct dependencies unless a documented constraint requires otherwise. Drift is caught by the drift-check script and must be resolved before merging.

### pnpm workspace overrides

`pnpm-workspace.yaml` enforces single versions for security-critical and widely-used packages:

- `better-auth`: pinned to **1.6.23** — overrides the stale `@better-auth/cli@1.4.21` transitive dependency to prevent installing `better-auth@1.4.21` (multiple CVEs). Single version enforced.
- `drizzle-orm`: pinned to **0.45.2** — overrides the stale CLI transitive to prevent SQL injection in `drizzle-orm@0.41.0`. Single version enforced.
- `typescript`: pinned to **6.0.3** across all workspaces until NestJS/Nx support TS 7.
- `rxjs`, `tslib`, NestJS core/platform packages, `lodash`, `brace-expansion`, `picomatch`, `path-to-regexp`, `serialize-javascript`, `postcss`, `follow-redirects`, `axios`, `fast-uri`, `svgo`, `js-yaml`, `yaml`, `ajv`, `ws`, `tmp`, `uuid`, `qs`, `undici`, `happy-dom`, `esbuild`, `form-data`, `http-proxy-middleware`, `@opentelemetry/core`, `multer`: all security-pinned per advisory.

## Deferred major updates

| Package         | Current | Latest | Blocker                                                           | Revisit trigger                                      |
| --------------- | ------- | ------ | ----------------------------------------------------------------- | ---------------------------------------------------- |
| TypeScript      | 6.0.3   | 7.x    | NestJS 11.x and Nx 23 target ts 6.x compiler APIs                 | First NestJS/Nx release with TS 7 peer ranges        |
| Babel           | 7.29.x  | 8.x    | Expo SDK 57 requires Babel 7 (`babel-preset-expo` peer)           | Expo SDK release declaring Babel 8 compatibility     |
| @fastify/static | 9.3.0   | 10.x   | NestJS 11 platform and Swagger peer ranges accept only 8.x or 9.x | NestJS releases with @fastify/static 10 peer support |
| @types/node     | 24.13.3 | 26.x   | Node 24 runtime — type definitions match the runtime major        | Runtime upgrade to Node 26                           |

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

## Docker image pinning

All service images use explicit, immutable tags — never `latest` or floating major-only tags:

| Service    | Pinned tag                     | Source                   |
| ---------- | ------------------------------ | ------------------------ |
| PostgreSQL | `17.6-alpine`                  | Docker Hub `postgres`    |
| Redis      | `7.4.3-alpine`                 | Docker Hub `redis`       |
| NATS       | `2.10.25-alpine`               | Docker Hub `nats`        |
| MinIO      | `RELEASE.2025-09-07T16-13-09Z` | Docker Hub `minio/minio` |

## Audit results (2026-07-15)

- **Production audit**: 0 vulnerabilities (exit 0)
- **Development audit**: 0 vulnerabilities (exit 0)
- **Peer dependencies**: 0 issues (`pnpm peers check`, exit 0)
- **Frozen lockfile install**: exit 0
- **Registry drift**: only the four incompatible majors listed above remain intentionally deferred
- **Deduplication**: `better-auth` → 1 version (was 2), `drizzle-orm` → 1 version (was 2)
