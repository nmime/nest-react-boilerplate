# Dependency and supply-chain management

Use this policy to keep dependency updates low-risk and reproducible.

## Compatibility matrix

| Constraint | Version | Rationale                                                                       |
| ---------- | ------- | ------------------------------------------------------------------------------- |
| Node.js    | 24.18.0 | Current Node 24 LTS baseline; engines accept `>=24 <25`                         |
| pnpm       | 11.15.1 | Workspace packageManager field; Docker aligned                                  |
| TypeScript | 6.0.3   | Pinned until NestJS/Nx support TS 7; workspace override enforces single version |
| React      | 19.2.3  | All frontend apps and libs; matches the Expo 57 supported runtime               |
| Nx         | 23.1.0  | All @nx/* packages aligned                                                      |
| Vitest     | 4.1.10  | All workspace consumers                                                         |
| Vite       | 8.1.5   | All workspace consumers                                                         |
| Astro      | 7.1.3   | Landing app and generated Astro applications                                    |
| Expo SDK   | 57.0.x  | Mobile app (Babel 7.x required — Babel 8 deferred until Expo compatibility)     |

## Package updates

- Keep `pnpm-lock.yaml` committed and install with `pnpm install --frozen-lockfile` in CI and release builds.
- pnpm's implicit dependency reconciliation is disabled with `verifyDepsBeforeRun: false` in `pnpm-workspace.yaml`. Run `pnpm install` explicitly when manifests change; ordinary scripts must not mutate `node_modules` or the lockfile.
- Prefer grouped minor/patch Dependabot PRs for routine updates; review major updates one ecosystem at a time.
- Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:coverage`, and `pnpm run audit` before merging dependency PRs.
- Regenerate API contracts/clients only when dependency changes affect generated output, then commit the generated diff in the same PR.

## Workspace dependency map

Run `pnpm run deps:map` for the live Markdown report or
`pnpm run deps:map -- --json` for machine-readable workspace, scope, and
dependency lists. The command derives its result from `pnpm-workspace.yaml` and
the checked-in manifests; it does not query the registry or mutate the lockfile.

Dependency ownership follows the workspace boundary rather than every Nx
library having its own package manifest:

| Source scope          | Owning manifest                                              | Purpose                                                                    |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `apps/backend/*/*`    | `libs/backend/package.json`                                  | External dependencies used by backend deployables                          |
| `apps/frontend/*`     | `libs/frontend/package.json` plus required renderer boundary | External dependencies used by browser, SSR, and native deployables         |
| `libs/backend/**`     | `libs/backend/package.json`                                  | External dependencies shared by backend common, feature, and database libs |
| `libs/frontend/**`    | `libs/frontend/package.json`                                 | External dependencies used by reusable browser/native libraries            |
| `libs/common/**`      | root `package.json`                                          | Cross-runtime dependencies; common libs are not a separate pnpm workspace  |
| `packages/tooling/**` | `packages/tooling/package.json`                              | Repository CLI, generators, QA, and operational tooling                    |

## Version alignment rules

All workspace manifests must use the same version for shared direct dependencies unless a documented constraint requires otherwise. Drift is caught by the drift-check script and must be resolved before merging.

Applications do not use package manifests for identity or targets. Nx
`project.json` owns those contracts, while source-import analysis derives the
exact external packages reachable through each live closure. Astro and Expo are
the current narrow exceptions: Astro's prerenderer consumes nearest-package
dependency metadata, and Expo refuses to run without it. Their app manifests
therefore group renderer dependencies but contain no name, version, scripts, or
entrypoint. The closure integration test verifies that
admin, user, landing, site, and mobile dependencies are declared by a canonical
platform/root owner and retain renderer/product isolation. App-only integration
source remains in the owning app; for example, Telegram Mini App code belongs to
`user-app`, while Expo/Tamagui imports remain in the mobile closure.

The full maintainer install uses pnpm's reviewed hoisting mode so dependencies
owned by the platform manifests resolve from application source. Selected
product installs remain flattened under `.nrb/closure/node_modules` and link
only selected Nx roots.

## pnpm and Bun parity

pnpm is the only dependency resolver, installer, workspace owner, and lockfile
writer. Bun executes the same pnpm-installed tree; it does not maintain a second
dependency graph. Repository static checks reject `bun.lock`, `bun.lockb`,
`bunfig.toml`, a duplicate root `workspaces` declaration, and Bun package-manager
commands such as `bun install`, `bun add`, `bun update`, or `bunx`. `bun run
--bun` remains supported for the pinned runtime compatibility contract.

### pnpm workspace overrides

`pnpm-workspace.yaml` enforces single versions for security-critical and widely-used packages:

- `better-auth`: pinned to **1.6.23** — overrides the stale `@better-auth/cli@1.4.21` transitive dependency to prevent installing `better-auth@1.4.21` (multiple CVEs). Single version enforced.
- `drizzle-orm`: pinned to **0.45.2** — overrides the stale CLI transitive to prevent SQL injection in `drizzle-orm@0.41.0`. Single version enforced.
- `typescript`: pinned to **6.0.3** across all workspaces until NestJS/Nx support TS 7.
- `bson`: temporarily pinned to **7.2.0** because 7.3.1 calls
  `node:v8.isBuildingSnapshot()`, which the pinned Bun 1.3.14 runtime does not
  implement. Remove the override when the upstream Bun fix reaches a stable
  release and the MongoDB Bun lanes pass.
- `@fastify/static`: pinned to **10.1.2** for CVE-2026-7120 and
  CVE-2026-15074. Nest 11.1.28's peer metadata stops at 9.x, so
  `peerDependencyRules.allowedVersions` records the exact tested 10.1.2 edge
  until Nest widens that declaration.
- Storybook packages stay version-aligned. `@storybook/csf-plugin` 10.5.4
  publishes `esbuild` as an optional wildcard peer; the scoped
  `peerDependencyRules.allowedVersions` entry records the tested 0.28.1 edge
  after the vulnerable-esbuild override rewrites the lockfile peer snapshot.
- `brace-expansion`: vulnerable 1.x/2.x/4.x/5.x resolutions are pinned to **5.0.8**
  for CVE-2026-14257.
- `js-yaml`: vulnerable 5.0.0–5.2.1 resolutions are pinned to **5.2.2** for
  GHSA-pm4m-ph32-ghv5; the existing 3.x/4.x pins remain separate.
- `rxjs`, `tslib`, NestJS core/platform packages, `lodash`, `picomatch`,
  `path-to-regexp`, `serialize-javascript`, `postcss`, `follow-redirects`,
  `axios`, `fast-uri`, `svgo`, `yaml`, `ajv`, `ws`, `tmp`, `uuid`, `qs`,
  `undici`, `happy-dom`, `esbuild`, `form-data`, `http-proxy-middleware`,
  `@opentelemetry/core`, `multer`: all security-pinned per advisory.

## Deferred major updates

| Package               | Current | Latest  | Blocker                                                     | Revisit trigger                                  |
| --------------------- | ------- | ------- | ----------------------------------------------------------- | ------------------------------------------------ |
| TypeScript            | 6.0.3   | 7.0.2   | typescript-eslint 8.65 declares TypeScript `<6.1.0`         | typescript-eslint release with a TS 7 peer range |
| Babel                 | 7.29.x  | 8.x     | Rollup, Jest, and Babel 7 plugins reject Babel 8            | All Babel consumers publish Babel 8 peer ranges  |
| @types/node           | 24.13.3 | 26.x    | Node 24 runtime; type definitions match the runtime major   | Runtime upgrade to Node 26                       |
| React / React DOM     | 19.2.3  | 19.2.8  | Expo SDK 57 requires exactly 19.2.3                         | Expo package matrix moves to the newer patch     |
| gesture-handler       | 2.32.0  | 3.1.0   | Expo SDK 57 requires `~2.32.0`                              | Expo package matrix includes 3.x                 |
| reanimated            | 4.5.0   | 4.5.2   | Expo SDK 57 requires exactly 4.5.0                          | Expo package matrix moves to the newer patch     |
| safe-area-context     | 5.7.0   | 5.8.0   | Expo SDK 57 requires `~5.7.0`                               | Expo package matrix moves to 5.8.x               |
| react-native-screens  | 4.25.2  | 4.26.2  | Expo SDK 57 requires exactly 4.25.2                         | Expo package matrix moves to 4.26.x              |
| react-native-worklets | 0.10.0  | 0.11.1  | Expo SDK 57 requires 0.10.0 in its supported package matrix | Expo package matrix includes 0.11.x              |
| happy-dom             | 20.10.6 | 20.11.0 | Vitest 4.1.10 declares the 20.10.6 peer version             | Vitest accepts the newer happy-dom release       |

`@fastify/static` 10.1.2 is the security-patched baseline used directly by the
Vike server and by Swagger. NestJS 11's static-package peer is optional; the
Fastify adapter does not import that plugin, while Swagger explicitly accepts
10.x. `peerDependencyRules.allowedVersions` records that exact reviewed peer
exception until Nest widens its optional range.

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

## Audit results (2026-07-26)

- **Production audit**: 0 vulnerabilities (exit 0)
- **Development audit**: 0 vulnerabilities (exit 0)
- **Peer dependencies**: 0 issues (`pnpm peers check`, exit 0)
- **Frozen lockfile install**: exit 0
- **Registry drift**: 12 package entries remain, represented by the 11 incompatible runtime/peer rows listed above
- **Deduplication**: `better-auth` → 1 version (was 2), `drizzle-orm` → 1 version (was 2)
- **Release plugins**: provider publishing, commit analysis, and release-note
  generation run through `release.config.mjs` on Node 24.18.0 and
  semantic-release 25. Releases tag the exact successful CI SHA; changelog/git
  mutation plugins are intentionally absent so protected default branches
  receive only reviewed changes.
