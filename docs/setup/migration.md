# Migration Guide

Migrate from legacy `init:project` and `generate:feature` scripts to the NRB setup engine (`pnpm nrb setup` / `pnpm nrb add`).

## What changed

| Legacy command                 | Replacement                                           | Notes                                         |
| ------------------------------ | ----------------------------------------------------- | --------------------------------------------- |
| `pnpm init:project`            | `pnpm nrb setup`                                      | Interactive wizard replaces placeholder init. |
| `pnpm generate:feature <name>` | `pnpm nrb add feature <name>`                         | Same vertical-slice engine, unified CLI.      |
| Manual `project.json` edits    | `pnpm nrb add app <name>` / `pnpm nrb add lib <name>` | Nx generators for new apps and libraries.     |
| Hand-authored config files     | `pnpm nrb setup --config nrb.config.json`             | Schema-validated, idempotent configuration.   |

## Compatibility guarantees

- **`init:project` still works**: the legacy command remains in `packages/tooling` and continues to replace boilerplate tokens. It does not conflict with `pnpm nrb setup`.
- **`generate:feature` still works**: the root alias invokes `pnpm nrb add feature`, and the deprecated `project:generate-vertical-slice` command delegates to that same Nx generator.
- **State is isolated**: `pnpm nrb setup` tracks state in `.nrb/state.json`. The legacy `init:project` uses Git to track changes. They do not interfere.
- **Idempotency**: `pnpm nrb setup` is safe to re-run. The planner produces zero operations if the workspace is already up to date.

## Migrating from `init:project`

### Before (legacy)

```bash
git checkout -b chore/initialize-project
pnpm init:project -- --name "Acme App" --domain acme.example --owner my-org --dry-run
pnpm init:project -- --name "Acme App" --domain acme.example --owner my-org
```

This replaced known boilerplate tokens in files and did not rewrite Git history.

### After (setup engine)

```bash
# Interactive:
pnpm nrb setup

# Non-interactive with preset:
pnpm nrb setup --preset fullstack --non-interactive

# Config file:
cp nrb.config.example.json nrb.config.json
# Edit nrb.config.json
pnpm nrb setup --config nrb.config.json
```

### What to keep doing manually

The setup engine does NOT replace these `init:project` responsibilities:

1. **Renaming the Git repository** — still a manual step.
2. **Replacing placeholder tokens** in files not tracked by the setup engine (e.g., Dockerfile image names, Helm chart values). Use `git grep` to find remaining `nest-react-boilerplate` or `example.com` references.
3. **Setting up CODEOWNERS, issue templates, Dependabot, CodeQL** — still manual or scripted outside the engine.
4. **Replacing placeholder secrets** — copy from `.env.local.example` / `.env.production.example` and fill in real values.

Recommendation: run `init:project` first (token replacement), then `pnpm nrb setup` (app/capability selection).

## Migrating from `generate:feature`

### Before (legacy)

```bash
pnpm generate:feature invoices -- --dry-run
pnpm generate:feature invoices
```

### After (unified CLI)

```bash
pnpm nrb add feature invoices --dry-run
pnpm nrb add feature invoices
```

The generated files are identical because both paths invoke `@repo/tooling:feature`.

### Additional options

The `pnpm nrb add feature` command supports `--force`, `--api-app`, and `--frontend-app`:

```bash
# Force overwrite existing files:
pnpm nrb add feature invoices --force

# Target a different API app:
pnpm nrb add feature invoices --api-app admin-app-api

# Target the admin frontend page boundary as well:
pnpm nrb add feature invoices --api-app admin-app-api --frontend-app admin-app
```

## Migration checklist

- [ ] Run `pnpm nrb doctor` to verify workspace health.
- [ ] If you previously ran `init:project`, skip manual token replacement for files already processed.
- [ ] Run `pnpm nrb setup --dry-run` to see what the engine would do.
- [ ] Run `pnpm nrb setup` (interactive) or with `--config` (non-interactive).
- [ ] Verify with `pnpm nrb doctor --json` that `nrb-config` and `nrb-state` checks now pass.
- [ ] Use `pnpm nrb add feature <name> --dry-run` for future feature scaffolding.
- [ ] Update CI/scripts that reference `pnpm init:project` or `pnpm generate:feature` to use the unified CLI.

## Rollback

If the setup engine changes files you want to undo:

1. **If `.nrb/state.json` exists**: re-run setup with the original config or an empty preset to reverse changes.
2. **Git reset**: `git checkout -- .nrb/ nrb.config.json` to discard setup-generated files.
3. **Delete state**: `rm -rf .nrb/ nrb.config.json` and start fresh.

## Next steps

- [Setup and Configuration](configuration.md) — detailed setup walkthrough.
- [Troubleshooting](troubleshooting.md) — recovery for failed migrations and conflicts.
