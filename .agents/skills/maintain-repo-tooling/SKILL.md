---
name: maintain-repo-tooling
description: Build and maintain the repository-owned nrb CLI and validation scripts. Use for commands, command groups, schemas, root scripts, executable checks, tooling tests, help text, or command-matrix changes.
---

# Maintain repository tooling

## Read first

- Read `../../../packages/tooling/README.md`, `../../../docs/setup/cli-reference.md`, `../../../docs/command-matrix.md`, the CLI registry, and neighboring commands/tests.
- Determine whether the behavior belongs in the `nrb` CLI, an Nx target, or a narrow repository script before adding another entrypoint.
- Use `../maintain-documentation/SKILL.md` when command behavior, agent routing,
  or documentation validation changes.

## Workflow

1. Put reusable command implementation under `packages/tooling`; keep root package scripts as stable, thin entrypoints.
2. Define arguments, defaults, validation, exit codes, dry-run behavior, and machine-readable output before implementation.
3. Avoid shell-dependent parsing and hidden network or mutation side effects. Mutating commands need clear targets and safe preview behavior.
4. Register the command once in the canonical CLI tree and update help, tooling README, CLI reference, and command matrix from actual behavior.
5. Add unit tests for success, validation failure, partial state, repeated execution, and platform-sensitive paths.
6. Keep validators deterministic, offline-capable, and actionable: errors must name the file, rule, and repair.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

Run targeted tooling tests, `pnpm run tooling:static-check`, applicable command smoke tests, docs formatting/checks, `pnpm run agent:verify` when agent or scaffolding behavior changes, and `git diff --check`.
