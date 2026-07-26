---
name: scaffold-feature
description: Scaffold a genuinely new application, library, or vertical feature through repository generators. Use when new ownership is required and dry-run, registration, contract generation, product completion, and broad verification are needed.
---

# Scaffold repository ownership

## Read first

1. `../../../AGENTS.md` and `../../../docs/ai/agent-policy.md`.
2. `../../../docs/architecture.md`, `../../../docs/frontend-fsd.md`, and the closest nested `AGENTS.md` files.
3. `../../../docs/scaffolding-and-extension.md`, `../../../docs/setup/cli-reference.md`, and the source/tests of the owning API and frontend app.

## Workflow

1. Verify the repository, branch, `HEAD`, and current `origin/main` SHA.
2. Inspect the Nx project graph, setup catalog, nearest `AGENTS.md`, and owning
   routes/modules. If ownership already exists, modify that owner in place;
   do not generate a sibling app, `-new`/`-v2` variant, starter app, or nested
   copy of the boilerplate.
3. Only for genuinely new ownership, run the intended generator with
   `--dry-run` and inspect every path before writing.
4. Use one canonical command:
   - Application: `pnpm nrb add app <name> --kind <kind> --renderer <renderer> --dry-run`
   - Library: `pnpm nrb add lib <name> --kind <kind> --type <type> --scope <scope> --description "<concrete responsibility>" --dry-run`
   - Feature: `pnpm nrb add feature <name> --api-app <api> --frontend-app <frontend> --dry-run`
5. Run without `--dry-run` only after the selected roots and ownership are correct.
6. When an app or library adds a package manifest, run `pnpm install` to update the lockfile and workspace links, then prove `pnpm install --frozen-lockfile`; never hand-edit `pnpm-lock.yaml`.
7. For a new deployable, complete the explicit selection, environment, local runtime, Docker/Helm, DNS/TLS, probes/resources, observability, and e2e registration checklist in `docs/scaffolding-and-extension.md`. A generated source root is not automatically public or deployed.
8. For a feature, replace the generic model fields with product invariants, review RBAC, validation, indexes, migration rollback, and repository error behavior. Never use `--force` or regenerate an existing product feature; modify its owning files in place.
9. Compile the API, then run `pnpm api:contracts` and `pnpm api:clients`. Never hand-edit generated OpenAPI or client output.
10. Register the generated FSD page through the owning app's public route boundary with translated copy.
11. For a web app with a stable screen composition, add an app-owned `storybook/` story and explicitly register it in the shared web Storybook config. Keep Expo in the native lane.
12. Add component and e2e coverage for auth, RBAC, validation, loading, empty, error, and success states. Do not use a screen story as proof of routing, production providers, authentication, API integration, or complete page flows.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

```bash
pnpm run agent:verify
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
