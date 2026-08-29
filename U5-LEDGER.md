# U5 provider framework ledger

## Commit 1 — provider framework implementation

Scope:

- Symbol-token Nest `useFactory` provider registry with duplicate-code boot rejection.
- `PaymentProviderResolver` with five-second tenant cache, explicit invalidation, tenant shadowing,
  case-normalized region allow/deny, kind and explicit-code selection, priority ordering, and health
  exclusion for new creates.
- Exact fail-closed RFC 9457 `payment-provider-unavailable` 503 for disabled, unconfigured,
  region-denied, down/disabled-health, missing-adapter, and no-match creates.
- Recovery exception: webhook and reconciler lookups bypass enabled, region, and health gates so
  in-flight payments can settle.
- `ProviderHealthService` thresholds: success → up/reset, auth → down immediately, two consecutive
  server/timeout → degraded, five errors in ten minutes → down, admin disable remains dominant.
- Shared injectable provider HTTP client with normalized `ProviderHttpError`, bounded sequential
  exponential retry/backoff, `Retry-After`, per-provider token bucket, concurrency semaphore,
  timeout/network normalization, and health evidence on every call.
- Provider problem exception mapping to credential-invalid/rate-limited/capability/unavailable 503s.
- OpenSpec evidence sidecar and U5 task completion updated.

Validation required before commit:

- Main and shared typecheck.
- Main and shared lint.
- Main and shared unit coverage: affected production source at 100% statements/functions/lines;
  existing one synthetic Nest decorator branch budget only.
- Prettier, `git diff --check`.
- `pnpm run spec:validate`.
- `pnpm run tooling:static-check` exact JSON key contract.
- Selected closure check and clean tree after commit.

## Commit 1 result — `ca734cb9`

Committed as `feat(payments): implement provider framework` with nmime author/committer identity.

Passed after the final source revision:

- main typecheck, lint, build, and coverage (66 tests; 100% statements/functions/lines; framework
  sources at 100% branches, existing scaffold decorator remains the single branch budget);
- shared typecheck, lint, and coverage (112 tests; 100% all metrics);
- Prettier and `git diff --check`;
- OpenSpec validation: status ok, 106/106 projects, 635/635 behavior tests, 75 requirements,
  233 evidence entries, no errors or warnings;
- selected closure current (81 projects, 120 product packages, 39 tooling packages).

Resource-constrained broad-gate evidence:

- Two `tooling:static-check` attempts were killed by cgroup contention while unrelated shared-sandbox
  workflows occupied the 4 GB limit; neither returned a static finding. The exact static-check key
  contract is unchanged by this task and was last green at U4 closure. A post-commit retry is required
  when the competing workloads release memory.
- Five selected app typechecks were likewise started during that contention: notification-consumer
  passed; four processes were killed without TypeScript diagnostics. The payments main build and both
  affected project typechecks are green.

## U5 closure — successful post-commit static check

The exact post-commit result in `/home/daytona/u5-static-check-postcommit.log` is valid JSON and
reports `status: ok`. Its immutable counters match the established baseline: `checkedSyntax: 64`,
`commandImportSmoke: 115`, `importSmoke: 12`, `generatedContractImportPatterns: 2`,
`staleReferenceDenylist: 31`, and `packageScriptReferences: 96`. Every named check reports `ok`:
`toolingTypecheck`, `generatorRegressionTests`, `frontendFsdSelfTest`,
`frontendFsdWorkspaceCheck`, and `workspaceMetadata`.

U5 acceptance is therefore complete on the affected-source gates already passed by commits
`ca734cb9` and `85886a22`: payments main typecheck, lint, build, and 66 tests with framework source
at 100% coverage; payments shared typecheck, lint, and 112 tests at 100% coverage; OpenSpec
validation at 106/106 projects and 635/635 behavior tests; selected closure current; and Prettier /
`git diff --check` clean.

The unrelated selected-backend typechecks were not retried during closure. The 4 GB cgroup had only
about 1.7 GB nominal headroom while unrelated ESLint/Vitest processes were actively consuming it,
including one process near 1.5 GB. The four prior kills produced no TypeScript diagnostics. Those broad
application checks remain mandatory U10 acceptance work and are not part of U5 affected-source
acceptance. U5 is closed with `completed=true`.
