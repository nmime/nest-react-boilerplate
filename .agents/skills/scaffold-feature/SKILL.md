# Scaffold a repository feature

Use this workflow when creating an application, library, or vertical product feature in this repository.

## Read first

1. `AGENTS.md` and `docs/ai/agent-policy.md`.
2. `docs/architecture.md`, `docs/frontend-fsd.md`, and the closest nested `AGENTS.md` files.
3. `docs/scaffolding-and-extension.md`, `docs/setup/cli-reference.md`, and the source/tests of the owning API and frontend app.

## Workflow

1. Verify the repository, branch, `HEAD`, and current `origin/main` SHA.
2. Run the intended generator with `--dry-run` and inspect every path before writing.
3. Use one canonical command:
   - Application: `pnpm nrb add app <name> --kind <kind> --renderer <renderer> --dry-run`
   - Library: `pnpm nrb add lib <name> --kind <kind> --type <type> --scope <scope> --dry-run`
   - Feature: `pnpm nrb add feature <name> --api-app <api> --frontend-app <frontend> --dry-run`
4. Run without `--dry-run` only after the selected roots and ownership are correct.
5. When an app or library adds a package manifest, run `pnpm install` to update the lockfile and workspace links, then prove `pnpm install --frozen-lockfile`; never hand-edit `pnpm-lock.yaml`.
6. For a new deployable, complete the explicit selection, environment, local runtime, Docker/Helm, DNS/TLS, probes/resources, observability, and e2e registration checklist in `docs/scaffolding-and-extension.md`. A generated source root is not automatically public or deployed.
7. For a feature, replace the generic model fields with product invariants, review RBAC, validation, indexes, migration rollback, and repository error behavior.
8. Compile the API, then run `pnpm api:contracts` and `pnpm api:clients`. Never hand-edit generated OpenAPI or client output.
9. Register the generated FSD page through the owning app's public route boundary with translated copy.
10. Add component and e2e coverage for auth, RBAC, validation, loading, empty, error, and success states.

## Required verification

```bash
pnpm run tooling:static-check
pnpm run scaffold:verify
pnpm run lib:configs:check
pnpm run frontend:fsd:check
pnpm run db:migrations:check
pnpm run api:contracts:check
pnpm run api:clients:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:e2e
git diff --check
```

Use the smallest applicable subset while iterating. `pnpm run scaffold:verify` is mandatory when application generator templates or their dependencies change; broaden the remaining gates for shared aliases, contracts, generators, or repository-wide boundaries.
