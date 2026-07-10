# Launching a new project from this boilerplate

## Setup engine (recommended)

The `nrb setup` engine is the primary way to configure which applications and capabilities your project uses. It is schema-validated, idempotent, and safe to re-run.

```bash
# Interactive wizard:
nrb setup

# Non-interactive with a preset:
nrb setup --preset fullstack --non-interactive

# Config file:
cp nrb.config.example.json nrb.config.json
# Edit nrb.config.json, then:
nrb setup --config nrb.config.json

# Dry run first:
nrb setup --preset starter --dry-run
```

See [Setup and Configuration](setup/configuration.md) for details.

## Token replacement (still needed)

The legacy `init:project` command replaces boilerplate tokens (`nest-react-boilerplate`, `Nest React Boilerplate`, database name, example domains, JWT audience, and owner placeholders). It refuses a dirty worktree unless `--force` is provided and does not rewrite Git history.

```bash
git checkout -b chore/initialize-project
pnpm install --frozen-lockfile
pnpm init:project -- --name "Acme App" --domain acme.example --owner your-github-org --dry-run
pnpm init:project -- --name "Acme App" --domain acme.example --owner your-github-org
```

**Recommendation**: run `init:project` first (token replacement), then `nrb setup` (app/capability selection).

## Manual checklist

1. Rename package, product title, database name, image repository, and public domains.
2. Copy `.env.local.example`, `.env.test.example`, or `.env.production.example` to the environment-specific secret source.
3. Replace placeholder secrets with values from a secret manager. Never commit real `.env` files.
4. Review `CODEOWNERS`, issue templates, Dependabot, CodeQL, and branch protection.
5. Configure production auth lifecycle decisions before launch: session storage, refresh tokens, password reset, email verification, rate limits, and audit events.
6. Export OpenAPI and generate typed client scaffolding if the frontend will consume generated API types.
7. Run migrations, seed only local/test environments, configure backups, then deploy through the Kubernetes/Ansible flow in `docs/production-deploy.md`.

## Placeholder audit expectations

Before production, search changed files for weak defaults such as `change-me`, `<set-from-secret-manager>`, `example.com`, local-only JWT secrets, default PostgreSQL passwords, and empty OAuth secrets. Keep placeholder values in example files only.

## Next steps

- [Migration Guide](setup/migration.md) — migrate from legacy `init:project` / `generate:feature` to the setup engine.
- [Quick Start](quick-start.md) — get the stack running locally.
- [CLI Reference](setup/cli-reference.md) — every command with flags and examples.
