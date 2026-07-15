# Migration Guide

Migrate compatibility aliases `init:project` and `generate:feature` to the
unified `pnpm nrb init`, `pnpm nrb setup`, and `pnpm nrb add` workflow.

## What changed

| Legacy command                 | Replacement                                                        | Notes                                         |
| ------------------------------ | ------------------------------------------------------------------ | --------------------------------------------- |
| `pnpm init:project`            | `pnpm nrb init`                                                    | Same initializer under the unified CLI.       |
| `pnpm generate:feature <name>` | `pnpm nrb add feature <name> --api-app <api> --frontend-app <app>` | Same engine with explicit app ownership.      |
| Manual `project.json` edits    | `pnpm nrb add app/lib <name>` with required typed flags            | Repository generators for apps and libraries. |
| Hand-authored config files     | `pnpm nrb setup --config nrb.config.json`                          | Schema-validated, idempotent configuration.   |

## Compatibility guarantees

- **`init:project` still works**: the root alias invokes the same implementation as `pnpm nrb init`. New docs and automation should use the unified command.
- **`generate:feature` still works**: the root alias invokes `pnpm nrb add feature`, and the deprecated `project:generate-vertical-slice` command delegates to that same Nx generator.
- **State is isolated**: `pnpm nrb setup` tracks state in `.nrb/state.json`. The legacy `init:project` uses Git to track changes. They do not interfere.
- **Idempotency**: `pnpm nrb setup` is safe to re-run. The planner produces zero operations if the workspace is already up to date.

## Migrating from `init:project`

### Before (compatibility alias)

```bash
git checkout -b chore/initialize-project
pnpm init:project -- --name "Acme App" --domain acme.example --owner my-org --dry-run
pnpm init:project -- --name "Acme App" --domain acme.example --owner my-org
```

This replaced known boilerplate tokens in files and did not rewrite Git history.

### After (unified initialization and setup)

```bash
pnpm nrb init --name "Acme App" --domain acme.example --owner my-org --dry-run
pnpm nrb init --name "Acme App" --domain acme.example --owner my-org

pnpm nrb setup --preset fullstack --non-interactive --dry-run
pnpm nrb setup --preset fullstack --non-interactive
```

The commands have separate ownership: `init` replaces product identity and all
example domains; `setup` selects apps and capabilities idempotently. A config
file remains available through
`pnpm nrb setup --config nrb.config.json`.

### What remains external

Neither initialization nor setup performs these external operations:

1. **Renaming the Git repository** — still a manual step.
2. **DNS and TLS provisioning** — initialization replaces hostname values but does not create DNS records or certificates.
3. **Setting up CODEOWNERS, issue templates, Dependabot, CodeQL** — still manual or scripted outside the engine.
4. **Replacing placeholder secrets** — copy from `.env.local.example` / `.env.production.example` and fill in real values.

Run `pnpm nrb init` first, then `pnpm nrb setup`.

## Migrating from `generate:feature`

### Before (legacy)

```bash
pnpm generate:feature invoices -- --api-app user-app-api --frontend-app user-app --dry-run
pnpm generate:feature invoices -- --api-app user-app-api --frontend-app user-app
```

### After (unified CLI)

```bash
pnpm nrb add feature invoices --api-app user-app-api --frontend-app user-app --dry-run
pnpm nrb add feature invoices --api-app user-app-api --frontend-app user-app
```

The generated files are identical because both paths invoke `@repo/tooling:feature`.

### Additional options

The `pnpm nrb add feature` command supports `--force`, `--api-app`, and `--frontend-app`:

```bash
# Force overwrite existing files:
pnpm nrb add feature invoices --api-app user-app-api --frontend-app user-app --force

# Target both owning applications explicitly:
pnpm nrb add feature invoices --api-app admin-app-api --frontend-app admin-app
```

## Migration checklist

- [ ] Run `pnpm nrb doctor` to verify workspace health.
- [ ] If you previously ran `init:project`, do not run `nrb init` again without reviewing the dry run; they are the same initializer.
- [ ] Run `pnpm nrb setup --dry-run` to see what the engine would do.
- [ ] Run `pnpm nrb setup` (interactive) or with `--config` (non-interactive).
- [ ] Verify with `pnpm nrb doctor --json` that `nrb-config` and `nrb-state` checks now pass.
- [ ] Use `pnpm nrb add feature <name> --api-app <api> --frontend-app <app> --dry-run` for future feature scaffolding.
- [ ] Update CI/scripts that reference `pnpm init:project` or `pnpm generate:feature` to use the unified CLI.

## Rollback

If the setup engine changes files you want to undo:

1. **If `.nrb/state.json` exists**: re-run setup with the original config or an empty preset to reverse changes.
2. **Git reset**: `git checkout -- .nrb/ nrb.config.json` to discard setup-generated files.
3. **Delete state**: `rm -rf .nrb/ nrb.config.json` and start fresh.

## Next steps

- [Setup and Configuration](configuration.md) — detailed setup walkthrough.
- [Troubleshooting](troubleshooting.md) — recovery for failed migrations and conflicts.
