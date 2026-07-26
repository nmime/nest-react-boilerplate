---
name: specify-behavior
description: Convert product intent into stable OpenSpec requirements, precise project ownership, and risk-based evidence before implementation. Use for new behavior, changed public or failure behavior, cross-project features, and ambiguous requirements that need executable acceptance criteria.
---

# Specify behavior

## Read first

- Read `../../../AGENTS.md`, `../../../docs/ai/agent-policy.md`,
  `../../../docs/specification-assurance.md`, and `../../../docs/testing.md`.
- Inspect `../../../openspec/config.yaml`,
  `../../../openspec/schemas/nrb-verifiable/schema.yaml`, the owning durable
  capability spec and `verification.yaml`, and the relevant source and tests.
- Read the nearest project `AGENTS.md`, `README.md`, and `project.json` before
  deciding ownership.

## Decide the specification path

1. Treat changes to observable success, failure, authorization, persistence,
   integration, UI, runtime, or operational behavior as specification work.
2. If an existing requirement already states the behavior, keep its stable ID
   and propose a `MODIFIED` requirement. Use `ADDED` only for genuinely new
   behavior and `REMOVED` only with an explicit compatibility decision.
3. For a non-behavioral refactor, record which existing requirements and
   evidence remain authoritative; do not invent a duplicate requirement.
4. When intent is ambiguous, expose the missing actor, boundary, invariant,
   failure, or example before implementation. Tests cannot recover an omitted
   requirement.

## Author the change

1. Create the change with
   `pnpm exec openspec new change <kebab-name> --schema nrb-verifiable`.
2. Complete discovery before proposal. Trace real owners, public contracts,
   failure modes, dependencies, runtime lanes, and current evidence.
3. Write each requirement with:
   - one stable `REQ-...-NNN` identifier
   - normative `SHALL` or `MUST` behavior
   - explicit invariants and failure behavior
   - at least one falsifiable scenario
   - a proportional evidence profile
4. Put business-readable cross-boundary examples in Cucumber only when they
   improve shared understanding. Give every scenario stable `@REQ-...` and
   `@SCN-...` tags; keep domain edge cases in Vitest and user journeys in
   Playwright.
5. Design requirement-level project ownership. Every named project must be a
   real Nx owner, and overlaps must represent a real cross-project behavior.
6. Plan sidecar evidence using version 2 manifests. A referenced evidence file
   must name the requirement, identify its execution target or root script, and
   use the correct PR, main, nightly, or runtime lane.
7. Complete `design.md`, `verification.md`, and `tasks.md` so implementation and
   review can proceed without guessing.

## Verification

Run:

```bash
pnpm exec openspec status --change <change>
pnpm exec openspec validate <change> --type change --strict --no-interactive
pnpm run spec:impact -- --base <base> --head HEAD
```

Do not archive an incomplete change. Hand off the change name, requirements,
owned projects, unresolved decisions, and the exact evidence expected from
`$implement-specified-change`.
