---
name: review-specification-assurance
description: Independently audit whether requirements are correct, complete, precisely owned, and supported by meaningful exact-revision evidence. Use for behavior-change reviews, release readiness, missing-scenario analysis, test-trace audits, and assurance dossier verification.
---

# Review specification assurance

## Read first

- Read `../../../AGENTS.md`, `../../../docs/ai/agent-policy.md`,
  `../../../docs/specification-assurance.md`, and
  `../../../openspec/config.yaml`.
- Read the active change, affected durable specs and version 3 sidecars, the
  implementation diff, evidence source files, and generated trace or assurance
  reports.
- Read owner-specific validation skills for the changed backend, frontend,
  persistence, deployment, or contract boundaries.

## Review model

1. Review intent before test mechanics. Check actors, success and denial paths,
   invariants, state transitions, retries, authorization, data boundaries,
   accessibility, observability, rollback, and operational failure.
2. Challenge omissions explicitly. Specifications and tests can prove stated
   examples, but they cannot prove that the original intent included every
   important scenario. Record missing stakeholder decisions as findings.
3. Confirm each stable requirement is singular, falsifiable, compatible, and
   represented accurately in the durable spec after archive.
4. Confirm requirement-level projects are precise. Reject capability-wide
   dumping, unknown owners, orphaned projects, and test markers whose
   requirement does not own the containing project.
5. Confirm evidence is meaningful:
   - source files explicitly name the claimed requirement
   - Gherkin examples have stable requirement and scenario tags
   - every requirement declares exactly one Cucumber disposition
   - `acceptance` has an acceptance profile and mapped Cucumber evidence
   - `not-applicable` has no acceptance profile or Cucumber evidence, gives a
     requirement-specific non-placeholder reason, and names mapped
     non-Cucumber alternatives
   - rationales are not copied across unrelated requirements
   - unit, contract, property, component, browser, mutation, security, and
     operations evidence match the risk instead of duplicating one another
   - skips, plans, and environment blockers are not reported as executed passes
6. Confirm the dossier is from a clean worktree at the reviewed source SHA and
   specification hash. Keep PR, main, nightly, and runtime claims separate.
7. Review implementation/code where risk or failed evidence demands it. The
   assurance model reduces reading load; it does not prohibit targeted review.

## Verification

Run:

```bash
pnpm exec openspec validate --all --strict --no-interactive
pnpm run spec:validate
pnpm run spec:trace
pnpm run spec:impact -- --base <base> --head HEAD
pnpm run spec:verify -- --base <base> --head HEAD --lane pr
git diff --check
```

Run owner-specific gates needed to falsify the riskiest claims. Exact-revision
verification requires a clean committed worktree.

## Output

Lead with severity-ranked findings. Include requirement IDs, exact files,
missing or weak scenarios, evidence and SHA status, commands run, and explicitly
unverified nightly/runtime boundaries. Do not approve release when the source,
specification, or evidence revision differs.
