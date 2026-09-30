# Template audit addendum — 2026-10-01

This addendum supersedes the current-state claims in the [historical audit](template-audit-2026-09-30.md). The implementation source is `79a121dec952e393920ff555b2957c860a2fe066`, on `chore/template-audit-refresh`, against main `4c79a30e2b851617bc05fc9f3ce68f98709b2796`. Subsequent documentation commits preserve that product source. Main and production remain unchanged; [PR #329](https://github.com/nmime/nest-react-boilerplate/pull/329) is a draft for review.

The [evidence inventory](template-audit-2026-10-01/evidence.json) binds local reports, source revisions, image references and log hashes. Detailed scanner and immutable patch artifacts are retained outside the checkout through Codex Security's artifact storage. Workstation paths and hashes are not remotely downloadable CI evidence.

The implementation has strong functional evidence. The final patch assessment recommends **revise**, because retained external scanner and vendor results are non-green and independent maintainer approval is outstanding. This audit does not certify a vulnerability-free template or production acceptance.

## Packages, skills and source repairs

The dependency-section census changes **208 declarations for 123 distinct packages across eight owning manifests**. This definition excludes newly added dependencies; the historical report used a different broader count. All eligible compatible upgrades and selected locks are included. The [dependency policy](../dependency-management.md) records compatibility holds, release-age quarantine and exact cohorts. React/Expo, TypeScript/ESLint, Babel, MobX and Nx/Vitest constraints are preserved rather than bypassed. The transitive gRPC security fix is pinned, and the all-severity pnpm audit reports zero vulnerabilities. Runtime images use Node 24.21.0 and pnpm 12.8.1; the host Node 24.18.0 is within the supported major.

All 32 repository skills and default prompts were reviewed for canonical ownership, in-place edits, specification routing, proof boundaries and explicit merge authority. The existing 45 executable canaries passed. Earlier full aggregate coverage, component/process/application, backup/restore, visual and observability evidence remains tied to its recorded source. It is not relabeled as a fresh final-head run.

The continuation repaired nine validated authority/session/cache/TLS/seed/storage findings from the completed `f487d1` security baseline. That completed scan remains sealed at its original revision. Further actual runtime checks repaired required PostgreSQL ORM injection, the browser fixture import boundary, missing SSR security headers, an absent Vike error page, dead site destinations, obsolete Schemathesis arguments, inaccurate OpenAPI metadata and the resulting oversized SPA entry data.

Site account/landing destinations are now explicitly configured, validated public URLs serialized through Vike hydration. Missing/unsafe values omit their actions. Unknown site routes return localized 404 HTML with recovery navigation and the same response headers. First-party OpenAPI includes webhook failure and Discord callback validation schemas; third-party wildcard forwarding and terminal rejection adapters are excluded from fabricated successful operations and retain separate HTTP/browser evidence. Contracts, generated clients, toast mappings and endpoint metadata are regenerated.

## Final functional evidence

| Lane                                     | Result                                  | Scope                                                                                                             |
| ---------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Exact-source specification assurance     | 80 requirements, 69 runs pass           | Clean `79a121d`; current specification hash recorded in inventory                                                 |
| PostgreSQL browser matrix                | 54/54 pass                              | Chromium, 320px Chromium, Firefox, WebKit and two responsive web profiles                                         |
| MongoDB browser matrix                   | 54/54 pass                              | Same nine journeys per profile, including a fresh owned administrator                                             |
| Database failure/recovery                | Pass on both providers                  | All three APIs: 200 with database healthy, owned database stop → 503, restart → 200                               |
| Changed source owners                    | Static checks, coverage and builds pass | Backend contracts, exception schemas, frontend SSR, UI and tooling; site lines/functions/branches remain 100%     |
| Contract/client/toast/endpoint freshness | Pass                                    | Generated source and two consumer interactions; 46 OpenAPI documentation warnings retained                        |
| Real Schemathesis                        | All three contracts pass                | GET/HEAD/OPTIONS only; response/status/media/schema checks; no unsafe writes or fabricated authenticated coverage |
| Storybook                                | Build and 32 interactions pass          | Hook dependency prebundled before browser tests, without mid-suite Vite reload                                    |
| Accessibility                            | Pass                                    | Built web apps and actual SSR home/404 URLs, two viewport profiles                                                |
| Bundle budgets                           | Four apps pass unchanged limits         | Largest admin chunk 352,125 B; user 183,609 B; SSR 190,112 B                                                      |
| Repository PR gate                       | Pass                                    | Tooling, docs, specification, format, native secrets/SAST and dependency audit                                    |

The browser journeys exercise durable registration/login, safe return navigation, session reload, custom and Better Auth cookie revocation/replay denial, delayed account-query cancellation, and cookie-only administrator roles/permissions. Database fixtures are selected by actual owned Compose labels and loopback ports; ambient or arbitrary external databases never authorize fixture writes.

Both selected provider image sets built through the canonical driver. Four changed API/SSR images were refreshed for each provider at `6dca9b8`; two provider-independent static SPA images were refreshed at `79a121d`. The inventory records each component's actual source and immutable container image reference. Unchanged PostgreSQL images retain `bc2785c` build/scan evidence; unchanged MongoDB images retain `0b37a82`. All twelve service container references per provider were checked against those records, including the intentionally stopped Telegram poller. No single-image-source or complete selected-stack readiness claim is made.

The first image-refresh helper mistakenly used external-test composition and omitted its synthetic database configuration; that rejected run was corrected, not counted. Replacing API containers also required restarting the owned static proxies to refresh their resolved upstream addresses. The accepted matrices ran after that topology correction. This is cold/local acceptance, not zero-downtime rollout evidence. The first bundle probe read coverage-instrumented output; the accepted probe followed clean production builds and a real generated-data chunk split, without larger budgets.

## Security results and unresolved lanes

Application Trivy scans report **zero HIGH/CRITICAL findings**: thirteen earlier PostgreSQL images, six refreshed PostgreSQL images and all thirteen retained final MongoDB image references. Provider-independent SPA artifacts are shared by both stacks. Scans use the pinned engine and retain raw results; unchanged older component evidence remains identifiable.

| Current vendor artifact | HIGH | CRITICAL | Boundary                                                                                                 |
| ----------------------- | ---: | -------: | -------------------------------------------------------------------------------------------------------- |
| PostgreSQL 17.11 Alpine |   21 |        1 | Go package metadata in gosu; critical TLS-session advisory has a narrow non-networking source assessment |
| MongoDB                 |   98 |        1 | Database tools, mongosh/OS packages and gosu; package findings remain retained                           |
| Redis 7.4.11 Alpine     |    4 |        0 | Two OpenSSL advisories repeated in libcrypto/libssl; current official manifest is unchanged              |
| SeaweedFS 4.47          |    1 |        0 | grpc-go advisory; previous source review did not find the affected xDS constructor                       |

These are artifact/package findings, not counts of confirmed remotely exploitable application vulnerabilities. Limited reachability assessments do not remove the findings or substitute for a vendor fix. Optional infrastructure scan results from earlier revisions remain historical. No advisory ignore entries were added.

The final external Semgrep command retains **16 alerts and 42 parser errors** across 3,650 scanned paths. Alert classes are the guarded release checkout, actual Nginx virtual-host forwarding, pnpm maturity policy versus generic package-manager rules, text/plain Better Auth forwarding, and deliberate TLS test fixtures. Raw findings remain non-green; parser gaps prevent a complete external-SAST claim. Native SAST retains 59 medium review advisories and no HIGH/CRITICAL findings.

The real SSR ZAP baseline reports **0 FAIL, 5 WARN, 62 PASS**, retaining its warning exit. The earlier application-error disclosure warning is now PASS after the safe 404 repair. Remaining warnings include the deliberately partial CSP, permissions/embedding policy, non-storable content and modern-application detection. No warning baseline was accepted just to make the command green.

Real Discord application identity/public-key configuration and a live Telegram token are absent. Discord readiness correctly fails; the synthetic Telegram poller is stopped. Workers have no health controller, so TCP process presence is not an invented HTTP-readiness pass. Native/device mobile work is deferred as requested; responsive web profiles are not native mobile acceptance. Linux amd64 runtime, live external email/auth/payment/bot delivery, funded operations, production rollout and long stress/soak remain unverified.

## Integration boundary

The immutable main-to-source patch is 712 files and 26,291,481 bytes, with SHA-256 `7bbabf36585207717871c16e92319ea1c705a23dcb46a6765783520c6895d292`. The validated patch-risk Markdown/JSON is outside the checkout; the inventory identifies its retained location and hashes. This is self-review plus earlier independent read-only baseline analysis, not final-head human approval.

Review the retained scanner/vendor dispositions and the required hosted checks before integration. PR #327's older Nginx digest is superseded by the newer digest already in this branch; it remains open until the maintainer approves the integration decision. Neither PR is merged. Existing object-store data needs explicit S3 migration, and existing database rollouts need provider-owned backup and recovery evidence. No production data or application was changed.

Root `AGENTS.md` requires specific approval for each main merge. The active goal remains pending review, risk disposition and that approval.
