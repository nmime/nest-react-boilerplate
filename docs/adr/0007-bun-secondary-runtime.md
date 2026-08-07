# ADR 0007: Bun 1.3.14 as a secondary runtime contract, Node as canonical

- Status: Accepted
- Date: 2026-08-04
- Owners: @nmime

## Context

Products increasingly want to run JavaScript under Bun for speed, while the
repository's build, coverage, and deployment tooling is proven on Node.js 24.
Supporting two package managers or two lockfiles would double supply-chain
surface and break the one-lockfile policy.

## Decision

Bun 1.3.14 is supported as an alternative JavaScript runtime behind a pinned
compatibility contract (`.bun-version`), executed with `pnpm run bun:check`
(`tooling:bun-compat`). Node.js 24 remains the canonical build, coverage, and
deployment runtime. pnpm 11.15.1 remains the only package manager and the sole
owner of resolution, installs, lockfiles, workspace policy, and deployment
dependency trees. The static check rejects Bun lock/config files, duplicate
workspace declarations, and Bun package-manager commands while allowing
`bun run --bun` execution.

## Consequences

- Compatibility evidence is a repeatable lane (builds, tests, runtime smokes)
  rather than an assumption; results are documented in
  `docs/bun-runtime-research.md`.
- No second lockfile, no Bun-only dependency paths, and no runtime-specific
  dependency sets.
- A Bun failure degrades the secondary lane, never the canonical Node path.

## Alternatives Considered

- Full Bun package-manager support: rejected because dual resolution/lockfiles
  contradict the supply-chain policy (`docs/supply-chain.md`).
- Ignore Bun entirely: rejected because the compatibility question recurs and
  needs a pinned, evidence-backed answer instead of anecdote.

## Validation

`pnpm run bun:check`, the static enforcement in
`pnpm run tooling:static-check`, and the evidence record in
`docs/bun-runtime-research.md`.
