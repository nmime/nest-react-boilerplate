---
name: maintain-generators
description: Change repository application, library, or feature generators and their templates. Use when editing generator schemas, ownership rules, template files, setup registration, dry-run behavior, or scaffold verification.
---

# Maintain repository generators

## Read first

- Read `../../../AGENTS.md`, `../../../docs/scaffolding-and-extension.md`, and `../scaffold-feature/SKILL.md`.
- Inspect the generator schema, implementation, templates, tests, project graph, setup catalog, and generated-root `AGENTS.md` files.

## Workflow

1. Establish the generator's ownership contract: canonical root, Nx name, tags, public alias, package boundary, selection behavior, and generated documentation.
2. Add or change schema validation before generation logic. Reject collisions, existing ownership, `-new` or `-v2` escape hatches, and unsupported option combinations.
3. Keep templates minimal and product-neutral. Do not reproduce reference product UI or overwrite existing roots.
4. Exercise representative `pnpm nrb add ... --dry-run` cases, including invalid and collision cases, before write-mode generation.
5. Update setup/catalog integration only when the generated project is a selectable capability or deployable.
6. Update source-backed CLI and scaffolding documentation in the same change.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

Run targeted tooling tests, `pnpm run agent:verify`, `pnpm run scaffold:verify` when application templates or dependencies change, `pnpm run tooling:static-check`, and `git diff --check`. Inspect generated output in a temporary directory; never use `--force` against product code.
