# Dependency and supply-chain management

Use this policy to keep dependency updates low-risk and reproducible.

## Compatibility matrix

| Constraint | Version | Rationale                                                                                                  |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Node.js    | 24.21.0 | Current Node 24 LTS baseline; engines accept `>=24 <25`                                                    |
| pnpm       | 12.8.1  | Root package-manager pin; Docker, CI, doctor, and environment templates aligned                            |
| TypeScript | 6.0.3   | typescript-eslint still requires `<6.1.0`; compiler-dependent Nx transforms remain on TS 6                 |
| React      | 19.2.3  | Expo 57's supported React/React DOM runtime                                                                |
| NestJS     | 12.1.1  | Core, common, testing, and platform adapters aligned; companion packages use their compatible v12 releases |
| Nx         | 23.2.1  | All directly owned `@nx/*` packages aligned                                                                |
| Vitest     | 4.1.11  | Current supported line for Nx 23.2.1; Storybook 10.6.1 also accepts this line                              |
| Vite       | 8.3.1   | All workspace consumers aligned                                                                            |
| Storybook  | 10.6.1  | Shared addons and React renderer aligned                                                                   |
| Astro      | 7.3.5   | Landing app and generated Astro applications; MDX 8 and React integration 7                                |
| Expo SDK   | 57.0.26 | Mature SDK 57 release; native runtime follows its published bundled-module matrix                          |

Nx React's optional Express 4 development-server peer is declared on that
consumer through a package extension; Nest's Express 5 adapter stays separate.
React and React DOM are pinned together in the workspace overrides so optional
Storybook and renderer peers use the same runtime as application hooks.
Metro configuration is aligned with React Native 0.86.3. Do not suppress those
peer mismatches with an unrestricted allowed-version rule.

Metro stays on the 0.84 API line with the 0.84.5 patch that replaces its
vulnerable image-size parser. Better Auth 1.7.6 uses social sign-in for generic
OAuth, explicit account-key lookups, and verified discovery subjects. See the
[Better Auth 1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide).
The temporary issuer-column requirement in 1.7.0–1.7.2 was removed upstream;
this template upgrades directly from 1.6 without adding that column.

## Package updates

- Keep `pnpm-lock.yaml` committed and install with `pnpm install --frozen-lockfile` in CI and release builds.
- pnpm's implicit dependency reconciliation is disabled with `verifyDepsBeforeRun: false` in `pnpm-workspace.yaml`. Run `pnpm install` explicitly when manifests change; ordinary scripts must not mutate `node_modules` or the lockfile.
- Prefer grouped minor/patch Dependabot PRs for routine updates; review major updates one ecosystem at a time.
- Dependabot version updates wait seven days. pnpm requires a one-day release age,
  rejects exotic transitive sources, and refuses provenance downgrades for releases
  from the last week. Established registry-signed packages older than that week
  remain installable through `trustPolicyIgnoreAfter`, including pre-provenance
  Chokidar, Semver, UA Parser, and TypeScript transform releases.
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

## pnpm ownership

pnpm is the only dependency resolver, installer, workspace owner, and lockfile
writer. Every install resolves the single `pnpm-lock.yaml`; no second package
manager or lockfile is supported.

## pnpm workspace overrides

`pnpm-workspace.yaml` enforces single versions for security-critical and widely-used packages:

- `better-auth` and `drizzle-orm` remain single-version dependencies. The unused,
  deprecated `@better-auth/cli` dependency has been removed; repository schema
  and migration commands remain the owned entrypoints.
- `typescript` stays on 6.0.3 and `@types/node` on the newest supported Node 24
  line. A package's latest major is not necessarily compatible with the runtime.
- The obsolete BSON 7.2.0 hold has been removed: BSON 7.3.3 guards access to
  `startupSnapshot.isBuildingSnapshot`, including on Node 24.
- Nest 12 accepts `@fastify/static` 10.x directly, so the old Nest 11 peer
  exception is removed. The plugin is pinned to 10.1.5.
- Security overrides cover patched supported API lines for `fast-uri`, `qs`,
  `js-yaml`, `svgo`, `undici`, `ip-address`, and other transitive dependencies.
  Keep selectors broad enough to cover the advisory's vulnerable range while
  preserving consumers' supported APIs.
- `image-size` 2.0.4 supplies an upstream patch. Its former audit exclusions
  have been removed; this workspace suppresses no GHSA advisories.
- Expo's worklets, reanimated, and screen dependencies are resolved from the
  SDK 57 matrix instead of unconstrained transitive peers. Worklets 0.10.1
  still requires a scoped extension for undeclared Babel imports; Tamagui
  2.7.7 retains the scoped React DOM dependency declarations.
- `minimumReleaseAge: 1440` stays active. The expired version-specific
  exclusions have been removed. Check current publication dates when refreshing
  the lockfile; do not disable quarantine to select a just-published release.

## Compatibility holds

Checked against published package metadata on 2026-09-30. Refresh the metadata
before lifting a hold; the table records constraints, not permanent bans.

| Family                | Selected       | Available newer line | Constraint                                                                                     |
| --------------------- | -------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| TypeScript            | 6.0.3          | 7.0.2                | typescript-eslint 8.71.0 declares `<6.1.0`; Nest Swagger 12 also declares TS 5/6               |
| Babel core            | 7.29.7         | 8.0.6                | Nx 23.2.1 and Expo's Babel plugin stack still consume Babel 7                                  |
| Node types            | 24.19.0        | 26.6.3               | Match the supported Node 24 runtime                                                            |
| React / React DOM     | 19.2.3         | 19.3.0               | Expo 57.0.26's bundled-native-module matrix specifies 19.2.3                                   |
| React Native          | 0.86.3         | 0.87.1               | Expo 57.0.26 specifies 0.86.3                                                                  |
| Gesture handler       | 2.32.0         | 3.3.0                | Expo specifies `~2.32.0`                                                                       |
| Safe area context     | 5.7.0          | 5.10.0               | Expo specifies `~5.7.0`                                                                        |
| Reanimated / worklets | 4.5.1 / 0.10.1 | 4.5.5 / 0.13.0       | Use Expo's exact native matrix                                                                 |
| MobX / React binding  | 6.16.1 / 4.1.1 | 7.0.5 / 5.1.0        | mobx-tanstack-query 7.3.0 declares MobX `^6.12.4`; upgrading only the binding breaks that edge |
| Vitest family         | 4.1.11         | 5.0.2                | Nx's Vitest plugin declares Vitest 3/4 peers; Storybook 10.6.1 also permits Vitest 5           |

The final registry refresh at `2026-09-30T19:01Z` upgraded Storybook and its
owned addons to 10.6.1, SWC to 1.16.12, Discord API types to 0.38.56, and
Expo/router to 57.0.26/57.0.24 after their release quarantine expired. SWC
1.16.13 was published on September 30 at 09:51 UTC and remains quarantined
until October 1 at 09:51 UTC. React and React DOM stay on Expo SDK 57's
supported runtime, including its scoped Tamagui renderer peers; React 19.3
types are held with their matching runtime.

`arctic` 3.7.0 is deprecated and has no newer stable release. The existing
Discord OAuth adapter still consumes it. Replacing that adapter is a separate
security-sensitive migration requiring callback, state/PKCE, token, and denial
proof; do not silently substitute a different OAuth implementation in a version
refresh.

For major migrations, read the official [Nest migration guide](https://docs.nestjs.com/migration-guide),
[Nx migrations](https://nx.dev/docs/features/automate-updating-dependencies),
[Vitest migration guide](https://vitest.dev/guide/migration/), and
[pnpm 12 release notes](https://github.com/pnpm/pnpm/releases/tag/v12.0.0).

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

## Pipeline step pinning

The rule is forge-neutral: a pipeline step is a dependency, so pin it by
immutable digest and keep the human-readable version beside it for review.

- Pin `include:` refs to a commit SHA and `image:` to a digest.
- Keep the human-readable version beside the pin so dependency-bot updates remain easy to review.
- A product that adds GitHub Actions pins every `uses:` entry to a full 40-character commit SHA for the same reason.
- Prefer a pinned runner/container image tag, or a digest, over a floating tag
  such as `latest` for CI and release reproducibility.

## Security gates

- Merge requests run GitLab Dependency Scanning and fail on moderate-or-higher vulnerable dependency additions.
- Mainline/release pipelines run `pnpm audit`, container SBOM generation, Trivy scanning, and keyless image signing.
- Production releases should record the image digest and may also use the
  commit-addressed `sha-<git-sha>` tag. Protect tags from mutation; the digest,
  not the tag's spelling, is the immutable artifact identity.

## Docker image pinning

Bundled service images use explicit version tags rather than `latest` or
floating major-only tags. These tags improve reviewability but are still
registry-mutable; pin digests as well if the product requires immutable base
image resolution.

| Service    | Pinned tag             | Source                           |
| ---------- | ---------------------- | -------------------------------- |
| PostgreSQL | `17.11-alpine`         | Docker Hub `postgres`            |
| MongoDB    | `8.0.32-noble`         | Docker Hub `mongo`               |
| Redis      | `7.4.11-alpine`        | Docker Hub `redis`               |
| NATS       | `2.15.0-alpine`        | Docker Hub `nats`                |
| SeaweedFS  | `4.47` (digest pinned) | Docker Hub `chrislusf/seaweedfs` |

Database component tests use the same PostgreSQL and MongoDB versions as the
bundled deployment configurations. Native device execution remains a separate
acceptance check from the Expo web and Android bundle exports.

Release plugins publish through `release.config.mjs` on Node 24.21.0 and
semantic-release 25. Releases tag the exact successful CI SHA; changelog/git
mutation plugins are intentionally absent so protected default branches receive
only reviewed changes.

## Historical audit results (2026-07-26)

- **Production audit**: 0 vulnerabilities (exit 0)
- **Development audit**: 0 vulnerabilities (exit 0)
- **Peer dependencies**: 0 issues (`pnpm peers check`, exit 0)
- **Frozen lockfile install**: exit 0
- **Registry drift**: 12 package entries remain, represented by the 11 incompatible runtime/peer rows listed above
- **Deduplication**: `better-auth` → 1 version (was 2), `drizzle-orm` → 1 version (was 2)

The September 30 advisory refresh identified gRPC 1.14.4 in OpenTelemetry and
Docker tooling. The workspace pins its mature 1.14.5 fix for
[certificate authorization](https://github.com/advisories/GHSA-m9gg-hp2v-232j)
and [handler error disclosure](https://github.com/advisories/GHSA-f596-whhp-79r4).
No advisory ignore entries are used.
