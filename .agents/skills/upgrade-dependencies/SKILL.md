---
name: upgrade-dependencies
description: Upgrade repository dependencies while preserving package scope and lockfile policy. Use for version changes, security upgrades, package-manager constraints, overrides, peer conflicts, migrations, and compatibility validation.
---

# Upgrade dependencies

## Read first

- Read `../../../docs/dependency-management.md`, `../../../docs/supply-chain.md`,
  `../../../package.json`, `../../../pnpm-workspace.yaml`, the owning package
  manifest, lockfile rules, and release notes or migration guide for the exact
  version range.
- Identify every runtime and project that consumes the package. Keep web, native, backend, common, and tooling dependencies in their owning scope.

## Workflow

1. State why the upgrade is needed and whether it is patch, minor, major, security, or ecosystem alignment.
2. Change the narrowest owning manifest. Use root dependencies or overrides only for genuine repository-wide policy or transitive remediation.
3. Use pnpm to update the lockfile; never hand-edit `pnpm-lock.yaml`. Preserve
   the Node.js and pnpm constraints owned by the root manifest.
4. Review install scripts, peer ranges, engines, transitive churn, deprecations, and security implications.
5. Apply documented source/config migrations without unrelated modernization.
6. Prove a normal install and `pnpm install --frozen-lockfile`, then validate all affected projects and runtime boundaries.

## Specification lifecycle

When an upgrade changes observable product, tooling, generated, or failure
behavior, establish or update the governing requirements with
`$specify-behavior` and synchronize implementation and evidence with
`$implement-specified-change`. For compatibility-preserving upgrades, keep the
existing requirements and show that their evidence remains valid.

## Verification

Run focused lint, typecheck, tests, and builds plus broader consumers for shared
packages. Run the repository dependency audit/check commands,
`pnpm run spec:validate` when behavior or evidence changed, and
`git diff --check`. Separate registry/network blockers from compatibility
failures.
