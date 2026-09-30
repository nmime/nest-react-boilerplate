# Template audit — 2026-09-30

This is a historical audit of `nmime/nest-react-boilerplate`, starting at
`4c79a30e2b851617bc05fc9f3ce68f98709b2796` on the topic branch
`chore/template-audit-refresh`. The implementation reviewed here ends at
`2e85eec83e842f5e89ca5a7ae92f15a784b7966c`; later commits add this report and
its evidence inventory. This report describes local verification, not a
production deployment or independent maintainer approval.

The [evidence inventory](template-audit-2026-09-30/evidence.json) records
dependency changes, source revisions, local image identities, and SHA-256 hashes
of the workstation logs. Logs and detailed generated reports remain local;
the inventory does not make them remotely downloadable. Re-run the commands
below to produce a dossier in a new checkout.

## Dependency refresh

The refresh changes **211 declarations for 124 distinct packages across eight
owning manifests**, including the new YAML test dependency. It also updates
Node, pnpm, CI/browser images, and bundled infrastructure. Generated selected
product manifests and locks are regenerated from their canonical owners.

| Owning manifest        | Changed declarations |
| ---------------------- | -------------------: |
| Root                   |                   85 |
| Backend platform       |                   40 |
| Frontend platform      |                   42 |
| Tooling                |                   19 |
| Migrator               |                    9 |
| Expo/mobile renderer   |                    7 |
| Astro/landing renderer |                    6 |
| Cucumber acceptance    |                    3 |

The runtime baseline is Node 24.21.0 and pnpm 12.8.1, with Nest 12, Nx 23,
TypeScript 6, Vite 8, Astro 7, Expo 57, and Better Auth 1.7.6. The
[dependency policy](../dependency-management.md) owns exact versions and the
published peer/native constraints. TypeScript 7, Babel 8, React 19.3, React
Native 0.87, Vitest 5, and incompatible MobX lines are deliberately held.
New releases still inside pnpm's release-age quarantine are also held. The
deprecated Arctic adapter has no newer stable release and remains an explicit
future auth migration.

Fresh frozen installation and strict peer validation pass. The all-severity
pnpm audit reports zero vulnerabilities. No GHSA exclusions are used;
release-age quarantine, provenance policy, and approved build-script controls
remain enabled for source/selected-closure resolution. Backend, SSR, and
migrator artifacts now retain the selected package-manager integrity metadata,
application lock entries, overrides, settings, and workspace policy. Fresh
standalone production installs skip resolution and preserve lock/policy hashes;
SSR declares ten runtime dependencies, and the PostgreSQL migrator declares
18, including required loaders promoted from selected development lock entries.
The SSR artifact also removes React Native optional-peer edges only where the
locked package metadata declares that peer optional. A fresh frozen install
adds 197 packages instead of 431 and contains no React Native, Metro, Gradle,
or JAR files. The compiled Linux arm64 image independently passes the same
filesystem exclusion check. It retains required peers, other platform bindings,
selected versions and integrity, and the exact workspace policy; the source/native
lock remains unchanged. Runtime dependency stages enforce frozen installs
without disabling the policy.
The source-fetch layer skips the redundant age walk before its offline frozen
install; source/selected resolution and runtime policy enforcement remain intact.
A version bump is not used to bypass a compatibility constraint.

## Failures found and repaired

| Surface                                    | Observed problem                                                                                                  | Final behavior and proof                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth                                | Removed account lookup/client APIs and changed generic OAuth sign-in contract                                     | Account-key lookup and social sign-in use the new API; local OIDC checks exercise signature, nonce, audience, and subject handling                                                                                        |
| Provider token and notification encryption | AES-GCM accepted an implicit tag length                                                                           | All three decryptors require a 16-byte tag; regression tests reject truncated tags                                                                                                                                        |
| Safe OpenAPI fetching                      | Closing the Undici dispatcher before consuming a streamed response could hang a large body                        | The response owns disposal after consumption, redirect, or rejection; real HTTP regression coverage preserves DNS pinning and bounds                                                                                      |
| PostgreSQL schema                          | Initialized empty UUID fields became invalid inferred defaults                                                    | Required UUID properties have no empty initializer; fresh migrations and entity lifecycle checks pass                                                                                                                     |
| Tenant migration rollback                  | Dropping policy on tables absent at that migration boundary failed                                                | Rollback guards each table with `to_regclass`; real UP/DOWN/UP and rollback checks pass                                                                                                                                   |
| MongoDB presentations                      | Strict collection validator rejected seven current optional presentation fields                                   | Fresh definition and ordered repair migration use the same strict validator; real MongoDB component tests pass                                                                                                            |
| Selected MongoDB build                     | Component-test imports introduced PostgreSQL-only helpers into the product build graph                            | Component-only Docker probes use an independent public entrypoint and explicit Nx graph exclusion; the selected MongoDB graph has 92 projects and excludes that helper                                                    |
| MongoDB payments startup                   | Generated wiring imported an empty module wrapper, and the canonical ledger omitted payment migrations            | The selected host imports the persistence module; all six providers contribute to the ledger, and actual replica-set replay validates payment collections and indexes                                                     |
| Backend deployment artifacts               | Nx pruned pnpm 12 package-manager integrity and policy metadata                                                   | Staging preserves the environment document and selected policy while keeping application dependencies pruned; a fresh standalone production frozen install succeeds without re-resolution                                 |
| MongoDB optional observer                  | A diagnostic interface parameter became a required `Object` dependency under production decorator metadata        | Explicit optional injection token; real Nest composition and compiled-code before/after diagnostics resolve all four persistence modules                                                                                  |
| SSR and migrator artifacts                 | Exact direct dependencies still allowed new transitive resolution during image creation                           | Selected application lock and pnpm integrity/policy documents are staged with a sole runtime importer; actual standalone installs skip resolution and retain hashes                                                       |
| SSR optional native peer                   | A combined web/native selection shipped React Native, Metro, and Android build files through MobX's optional peer | SSR staging prunes only metadata-declared optional native edges; actual frozen installation adds 197 packages instead of 431, retains policy/integrity, loads runtime modules, and has no native build packages or JARs   |
| PostgreSQL Docker backup                   | Archive paths outside the repository were inaccessible inside the client container                                | Only the archive parent is mounted; restore is read-only and credentials are passed through environment; a real separate-database restore preserves rows and constraints                                                  |
| Frontend presentations                     | Bundled rich catalogs exceeded the existing application budget                                                    | Canonical compact catalogs preserve all 1,044 presentation mappings and public parsing rules; all four existing budgets pass without raising thresholds                                                                   |
| Frontend errors and controls               | Internal error details and unlabeled controls weakened UX and accessibility                                       | Safe localized error text, choice-control labels, localized dialog close labels, and meaningful notification integration flows are covered                                                                                |
| Tooling process execution                  | Native pnpm launch and large piped JSON could fail or truncate                                                    | Executable-aware launch with `shell: false` and output drain before exit are covered by regression tests                                                                                                                  |
| Backend optional development peers         | Better Auth's resolved optional Vitest peer installed browser/test tools despite no direct dev dependencies       | Backend staging removes only metadata-declared optional canonical development and native peers; a standalone frozen install adds 372 packages, retains hashes and loads frameworks; required/production peers stay intact |
| Backend dependency classification          | The flattened install manifest promoted selected test/build tools into Nx runtime manifests                       | Canonical source metadata is restored after the selected frozen install, before Nx generates runtime dependencies; runtime image inspection and full-stack startup verify exclusion                                       |
| Image loading                              | Concurrent extraction exhausted Docker disk on both PostgreSQL attempts                                           | Canonical driver loads two images per batch by default with a positive override, retains one full compile union, and stops on a failed batch; final runtime proofs use batch size one                                     |
| Collector startup                          | Invalid `from_env` resource processor key and a shell healthcheck in a scratch image                              | Native parser validates `${env:NODE_ENV}` with upsert; real HTTP readiness and OTLP-to-Prometheus-to-Grafana metric queries pass                                                                                          |
| Alertmanager startup                       | Shell placeholders in native YAML failed SMTP and webhook validation                                              | Native-valid empty receivers preserve grouping/routing; real integrations must be configured before claiming notification delivery                                                                                        |
| Grafana authentication/provisioning        | Secret setting used `_FILE` instead of `__FILE`; duplicate providers and unbundled datasource definitions         | Actual random-secret login succeeds and default password fails; one dashboard provider, two bundled datasources, and the production dashboard are queried in the running stack                                            |
| CI provenance                              | Release could bypass the reports stage                                                                            | Release follows the verified gate fan-in; gate inventory and deployment configuration assertions pass                                                                                                                     |
| Scanner wrapper                            | Semgrep findings could exit successfully, and raw results were not retained                                       | `--error` is required and raw JSON is retained; the external lane now fails honestly on unresolved findings                                                                                                               |
| OpenSpec active delta                      | Existing durable API Response Studio requirements were incorrectly marked ADDED                                   | Delta is MODIFIED and retains all five current requirement blocks; strict validation passes without archiving unfinished work                                                                                             |

## Bundled object storage

The public MinIO image used by this template was unavailable from Docker Hub;
the alternative Quay pull also failed. Its open-source repository was archived,
and its subsequent security fixes were unavailable in a current free OSS image; see the
[MinIO security advisory](https://github.com/minio/minio/security/advisories/GHSA-hv4r-mvr4-25vw).
The bundled local service now uses SeaweedFS 4.47 with an immutable image digest.
The [upstream release](https://github.com/seaweedfs/seaweedfs/releases/tag/4.47)
and [mini command implementation](https://github.com/seaweedfs/seaweedfs/blob/4.47/weed/command/mini.go)
were checked before adopting the image.

The service exposes S3 and the authenticated admin surface on loopback, disables
the unused filer/master HTTP surface, and uses a fresh volume. The live test
loads the tracked Compose configuration and verifies bucket/object operations,
metadata, missing objects, rejected invalid signatures and anonymous writes,
and the admin login boundary. It starts its own S3 fixture without introducing
the PostgreSQL test-helper graph into a MongoDB selection.

Existing MinIO on-disk data is not compatible with the new volume. Copy it
through the S3 API into a fresh store; see the
[configuration migration guidance](../setup/troubleshooting.md). External
production S3 integrations were not contacted or changed.

## Monitoring and image packaging

The monitoring refresh pins collector 0.161.0, Prometheus 3.15.0,
Alertmanager 0.34.1, Grafana 13.2.3, and optional Coroot 1.27.0 to published
immutable manifests. Collector 0.162.0 was released on GitHub but its Docker
image returned not found, so no unresolvable pin is introduced. All five
manifests include Linux amd64; actual startup and scans here use Linux arm64.
`pnpm run test:observability-stack` runs the native parsers and 14 real checks,
including resource attributes on an OTLP metric, all four scrape targets,
Grafana secret authentication and provisioned dashboard, datasource proxy
query, Alertmanager routing, and cleanup of only the owned temporary project.
Coroot's HTTP startup is checked; Kubernetes/eBPF discovery is not established.

The earlier PostgreSQL image compile failed during concurrent extraction on
both its initial run and automatic retry. Loading is now bounded without
splitting the builder's complete project union. The final provider runs select
`NRB_IMAGE_BUILD_BATCH_SIZE=1`. The canonical manifest fix also exposed optional Better Auth/Vitest peers that
still installed a physical browser/testing chain. Backend staging now removes
only peers declared optional by their owners, when canonical source metadata
classifies them as development dependencies and the artifact does not explicitly
require them. The fresh standalone install adds 372 packages and preserves
lock/policy hashes. Final inspections check manifests, direct modules and physical
pnpm package chains in every backend image for both database selections.

Recovery removed only unused owned `nrb:local`
tags and positively identified private template cache entries; a later bounded
cleanup reclaimed 3.395 GB after the earlier 4.579 GB cleanup. Unrelated Docker
workloads, image tags, volumes, and cache mounts were left intact. Failed logs
remain separate from final runtime proof; source, closure and image identities
are recorded together. The Docker guest reported 132.2 GB capacity and 83.7 GB
free during the final run, larger than the earlier failed environment. Bounded
batches control peak concurrency; these runs do not prove the complete thirteen
image selection fits the earlier disk limit, or reduce total retained image size.

## Local verification results

Counts below describe the executed lane, not an assertion that every possible
product integration has been exercised.

| Lane                          | Result                                                                                     | Boundary                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Nx lint and typecheck         | 187 applicable targets passed after the focused lint repair                                | Full maintainer workspace, including unselected owners                                                              |
| Nx build                      | 106 build targets passed                                                                   | Separate from actual Docker release-image compilation                                                               |
| Coverage                      | All 86 applicable coverage targets passed their configured floors                          | Floors were not lowered; this is not 100% workspace coverage                                                        |
| Component tests               | Actual PostgreSQL, MongoDB, Redis, NATS, and S3 fixtures passed                            | No production database or funded integration                                                                        |
| Tooling                       | Full suite and later affected-owner regressions passed                                     | Includes fresh setup, closure, migration ledger, and deployment-policy behavior                                     |
| Onboarding                    | 11 generated canary targets passed                                                         | Application/library ownership and in-place-first guards exercised                                                   |
| Frontend e2e                  | All five renderer lanes passed                                                             | Expo web/Android exports and web browser proof; no physical iOS/Android execution                                   |
| Storybook                     | 32 browser/component accessibility tests passed                                            | Real browser mode, not only DOM unit tests                                                                          |
| Visual matrix                 | Darwin 110 and Linux 110 strict comparisons passed                                         | 88 missing Darwin baselines and five Linux browser-rendering changes were visually reviewed; no tolerance inflation |
| Renderer accessibility        | Six rendered targets at desktop/mobile sizes, zero axe violations                          | Tested routes and states only                                                                                       |
| Bundle budgets                | All four existing web application budgets passed                                           | Mobile export is a separate lane                                                                                    |
| Performance                   | Five page samples and 20 SSR readiness requests passed                                     | Local response/HTML measurements, not Lighthouse, long soak, or production load                                     |
| PostgreSQL compiled fullstack | 13 images compiled; eight real browser/API journeys passed                                 | Source `2e85eec8`; final canonical source classification and optional-peer repair, 94 selected projects             |
| MongoDB compiled fullstack    | 13 images compiled; eight real browser/API journeys passed                                 | Source `2e85eec8`; isolated officially generated selection, 92 projects, PostgreSQL test helper absent              |
| Backup/restore                | Real canonical CLI backup and separate disposable-database restore passed                  | Two rows including nested JSON/Unicode, primary-key enforcement, and unchanged source verified                      |
| Contracts                     | Generated contracts/clients fresh; two consumer interactions passed                        | OpenAPI fuzzing ran 159 native cases and **zero live cases**                                                        |
| Properties                    | 100 iterations / 920 checks passed                                                         | Owned property lane, not every domain property                                                                      |
| Money mutation                | 92.18%, 283/307 mutants killed; 24 survived                                                | Money scope only; no scanner error/timeout; survivors include boundary/message/equivalent behavior                  |
| Deployment                    | Compose selections, Helm rendering, and release/config checks passed                       | Read-only configuration proof; nothing deployed or published                                                        |
| Specification model           | 111 projects, 677 behavior files, 80 requirements, 281 mapped evidence entries; all traced | Exact final topic-SHA PR dossier is generated separately with `spec:verify`                                         |

The fullstack journeys cover durable registration/login and cookies, API/SSR
readiness identities, responsive public navigation, meaningful SSR HTML and
hydration, safe auth failures, login/return/reload/logout revocation, Telegram
Mini App authentication through the proxy, and the admin cookie boundary.
The Telegram lane simulates the signed integration; it does not prove native
Telegram acceptance or real provider credentials.

The aggregate world-class runner was also executed. A default localhost backup
target initially failed because no database was running there. The real
disposable restore subsequently found and verified the archive-path repair.
The final explicitly configured aggregate passed eight gates and skipped four,
including real disposable backup/restore for both recovery gates. Its status is
`partial`, and its result is retained in the evidence inventory. Load/stress/soak, chaos, canary, and reliability runtime targets are
unconfigured local skips; browser-matrix configuration validation is not a
physical-device execution. CI refuses those missing targets unless a partial
run is explicitly selected. There is no blanket world-class-complete claim.

## Security review and remaining limitations

| Check                         | Result                                                 | Interpretation                                                                                                   |
| ----------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| pnpm all-severity audit       | Zero vulnerabilities                                   | Current lockfile registry advisories, not application security completeness                                      |
| Real Gitleaks                 | Zero findings                                          | Source/fixture scope; generated reports and builds excluded intentionally                                        |
| Native SAST policy            | Pass, 59 medium advisories                             | 46 `exec`/`pipeline` name matches are regex/Redis APIs; 13 are local HTTP fixture/tooling URLs                   |
| External Semgrep 1.178        | **Fail: 13 findings and 40 scanner errors**            | Raw findings/errors retained; no blanket suppression or clean external-SAST claim                                |
| Trivy 0.74 application images | Zero HIGH/CRITICAL in 26 provider-specific image scans | Exact local IDs recorded; all-severity pnpm audit separately covers JS dependencies                              |
| Vendor infrastructure images  | **148 raw HIGH and two CRITICAL across nine images**   | Separate immutable IDs and raw reports retained; not included in the clean application-image claim               |
| SeaweedFS image               | **One raw HIGH, no CRITICAL**                          | CVE-2026-84445 in grpc `v1.85.0-dev`; assessed required runtime precondition absent, not a patched-library claim |

Semgrep's 13 findings comprise eight nginx Host forwarding rules, two pnpm
release-age recommendations, one npm release-age rule, one text/plain callback
response warning, and one TLS fixture warning. Source review confirms fixed
Better Auth base URLs/trusted origins, the deliberate one-day pnpm versus
seven-day bot policy, a pnpm-only workspace, and local-only fixture behavior.
The 40 scanner errors comprise 15 syntax errors, 21 partial parsing errors and
four pnpm-lock timeouts, including raw Helm template parsing. These errors are a coverage limitation and
require scanner/rule follow-up; a native policy pass does not erase them.

The [gRPC advisory](https://github.com/grpc/grpc-go/security/advisories/GHSA-2v4p-qf9q-27wj)
requires `xds.NewGRPCServer`. The released SeaweedFS 4.47 source has no call or
import of that constructor; `weed/pb/grpc_client_server.go` uses `grpc.NewServer`.
The raw HIGH remains in the report without an ignore entry. Alpine 3.24.2
metadata also produced a scanner support/EOL-list warning. Database, broker,
and other third-party images were scanned separately from the application images.
Their raw HIGH/CRITICAL counts are: collector 0/0, Prometheus 0/0,
Alertmanager 2/0, Grafana 8/0, Coroot 21/0, PostgreSQL 21/1,
MongoDB 96/1, Redis 0/0, and NATS 0/0. Counts include repeated advisory occurrences
in separate binaries; there are 50 distinct package/advisory pairs.

The two CRITICAL occurrences are CVE-2025-68121 in the `gosu` 1.19 helper
compiled with Go 1.24.6. The advisory requires TLS session resumption; reviewed
released gosu source has no direct network/TLS imports. Alertmanager's released
source has no `xds.NewGRPCServer` constructor or import required by its raw
gRPC advisory. These are limited source assessments, not vendor rebuilds or
blanket reachability clearance. Other embedded MongoDB tools, Grafana plugins,
and Coroot packages retain unresolved findings. No ignore entries hide them;
promotion needs a current vendor patch or explicitly reviewed disposition.

No production deployment, package/image publication, real payment, cloud auth
callback, long-running operational acceptance, independent human approval, or
remote forge pipeline result is established here. The upstream repository
ships GitLab CI and a forge-neutral gate inventory, not GitHub Actions;
validating its 46 gates and 13 controls locally is not execution of remote CI.
GitHub currently protects `main` with the GitHub Actions `CI status summary`
context, although that forge was deliberately removed in commit `caf0c99a`.
No corresponding run exists. Choosing the authoritative forge and wiring its
complete gate inventory is required before integration; an admin bypass or a
manually posted green status would not establish CI evidence.

## Skills, prompts, and review

All 32 repository skills and their default prompts were reviewed against
current owners, canonical sources, specification routing, mutation boundaries,
and evidence meaning, then structurally validated. Eight skills and their
prompts were improved:

| Skill                      | Strengthened workflow                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pr-review`                | Exact revision, self-review versus independent approval, and proof boundaries                         |
| `validate-change`          | Final-stage gates and specific main/production approval                                               |
| `upgrade-dependencies`     | Owning manifests, generated closures, compatibility holds, and metadata                               |
| `migrate-database`         | PostgreSQL and MongoDB selection, complete ledger, fresh/replay proof, and provider-specific reversal |
| `activate-capability`      | Public port binding, optional injection tokens, production metadata, and selected startup             |
| `ci-triage`                | Required context versus configured forge, actual checks, and no fabricated green status               |
| `prepare-deployment`       | Frozen artifacts, source/selection/image identity, and separate raw infrastructure scans              |
| `validate-backend-quality` | MongoDB replica sets, S3, complete migration ledger, replay, and validator/index proof                |

Tool adapters remain redirects to one canonical policy. Setup/generator checks
cover in-place-first ownership, explicit app selection, and fresh-fork behavior.

The implementation was self-reviewed across source, tests, generated catalogs,
locks, CI, migrations, runtime packaging, frontend ownership, and instructions.
This is not an independent review approval. The previous nginx digest PR is
superseded by the newly verified digest in this refresh, but has not been
silently merged or closed. Main and production remain read-only until the
maintainer approves a specific integration.

## Reproducing the final dossier

Install Node 24 and the pinned pnpm version, with Docker and the supported
Playwright browsers available. Select applications/provider through official
setup rather than editing generated closure artifacts. Then run:

```bash
pnpm install --frozen-lockfile
pnpm peers check
pnpm run spec:validate
pnpm exec openspec validate --all --strict --no-interactive
pnpm run spec:trace
pnpm run spec:impact -- --base <base-sha> --head HEAD
pnpm run spec:verify -- --base <base-sha> --head HEAD --lane pr
NRB_IMAGE_COMPILE=1 NRB_IMAGE_BUILD_BATCH_SIZE=1 pnpm run test:fullstack
pnpm run test:observability-stack
```

The final `spec:verify` dossier is bound to a clean commit and records which
mapped evidence ran in the PR lane. Nightly-only mutation, physical devices,
external providers, and production targets require their separate configured
lanes. Keep the source commit, selected closure, image IDs, report hashes, and
execution environment together when reproducing or promoting the template.
