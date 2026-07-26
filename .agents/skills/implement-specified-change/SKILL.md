---
name: implement-specified-change
description: Implement approved OpenSpec behavior while synchronizing source, executable tests, Gherkin examples, requirement ownership, and exact-revision evidence. Use after a verifiable change is approved or when existing durable requirements already authorize the requested behavior.
---

# Implement a specified change

## Read first

- Read `../../../AGENTS.md`, `../../../docs/ai/agent-policy.md`,
  `../../../docs/specification-assurance.md`, and the nearest owner guidance.
- Read every artifact under `../../../openspec/changes/<change>/`, the affected
  durable specs and version 2 `verification.yaml` sidecars, and the real source
  and tests before editing.
- If no approved requirement governs observable behavior, stop implementation
  and use `$specify-behavior`.

## Workflow

1. Run `pnpm exec openspec status --change <change>` and resolve incomplete or
   contradictory artifacts before code changes.
2. Implement inside existing owners. Propagate public changes through API,
   persistence, UI, runtime, generated artifacts, and documentation as required
   by the approved design.
3. Select evidence by risk:
   - Vitest for domain rules, boundaries, and failure paths
   - contract and property tests for API invariants
   - component or Testcontainers tests for persistence and infrastructure
   - Cucumber for business-readable cross-boundary acceptance examples
   - Playwright for critical user journeys
   - mutation, security, operations, and runtime lanes where the profile requires
     them
4. Add exactly one `// @requirements REQ-...` inventory marker to every new or
   changed executable test file. List only durable requirements that own the
   test's Nx project. The marker is inventory; it does not replace selected
   evidence in the sidecar.
5. Keep Gherkin synchronized with stable `@REQ-...` and `@SCN-...` tags. Do not
   restate unit-level permutations as feature prose.
6. Update requirement-level `projects` and evidence references in each affected
   `verification.yaml`. Evidence files must explicitly name every requirement
   they claim to verify.
7. Complete the active tasks only after the corresponding implementation and
   evidence exist. Archive only when the change and repository gates pass.

## Verification

Run focused owner checks first, then:

```bash
pnpm exec openspec validate <change> --type change --strict --no-interactive
pnpm run spec:validate
pnpm run spec:impact -- --base <base> --head HEAD
pnpm run spec:verify -- --base <base> --head HEAD --lane pr --dry-run
git diff --check
```

Run the selected real evidence commands before handoff. A dry run proves
selection only. Passing evidence from a dirty worktree or another SHA cannot
authorize release.

## Handoff

Report requirement IDs, changed owners, synchronized tests and scenarios,
commands and outcomes, and any unavailable nightly or runtime evidence. Route
final independent review through `$review-specification-assurance`.
